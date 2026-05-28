use std::collections::HashMap;
use std::sync::Arc;

use anyhow::{anyhow, Result};
use regex::Regex;
use serde::Serialize;
use tauri::State;

use crate::ai::{active_profile_for_task, chat_complete, load_config, ChatMessage, TaskKind};
use crate::commands::term_filter::{
    is_term_candidate, is_term_candidate_with, normalize_term as filter_normalize,
    surface_quality_bonus,
};
use crate::storage::{
    LibraryPaths, NewPaperTerm, Paper, PaperRepo, PaperTerm, PaperTermRepo, RelatedPaperTerm,
};
use crate::AppState;

const MAX_TERMS: usize = 12;
const MAX_EVIDENCE_CHARS: usize = 180;
const CONTEXT_BEFORE_BYTES: usize = 60;
const CONTEXT_AFTER_BYTES: usize = 80;
const PENDING_DEFINITION: &str = "__litera_pending_llm_definition__";
const NOISE_TERMS: &[&str] = &[
    "abstract",
    "acknowledgements",
    "acknowledgments",
    "advanced",
    "article",
    "copyright",
    "doi",
    "figure",
    "fig",
    "gmbh",
    "https",
    "materials",
    "references",
    "research",
    "supplementary",
    "supporting",
    "table",
    "wiley",
    "www",
];
const NOISE_ACRONYMS: &[&str] = &["PS", "PDF", "HTML", "HTTP", "HTTPS", "WWW", "DOI"];
/// Minimum quality-weighted score for a candidate to be eligible. Calibrated so
/// a single appearance of a lowercase bigram (tf=1, idf≈1, bonus=0.7) sits at
/// ~0.7 and gets dropped, while a Title-Case 3-gram appearing once still passes.
const MIN_ACCEPT_SCORE: f64 = 0.9;

#[derive(Debug, Clone, Serialize)]
pub struct ReaderPaperTerm {
    pub term: PaperTerm,
    pub related: Vec<RelatedPaperTerm>,
    pub definition_status: String,
}

#[tauri::command]
pub async fn paper_terms_list(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
) -> Result<Vec<ReaderPaperTerm>, String> {
    let repo = PaperTermRepo::new(&state.pool);
    let terms = repo
        .list_by_paper(&paper_id)
        .await
        .map_err(|e| e.to_string())?;
    enrich_terms(&repo, &paper_id, terms)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_terms_generate(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
) -> Result<Vec<ReaderPaperTerm>, String> {
    paper_terms_generate_candidates(state.clone(), paper_id.clone()).await?;
    paper_terms_explain(state, paper_id).await
}

#[tauri::command]
pub async fn paper_terms_generate_candidates(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
) -> Result<Vec<ReaderPaperTerm>, String> {
    let paper = PaperRepo::new(&state.pool)
        .get(&paper_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "paper not found".to_string())?;
    let body = extract_pdf_body(&paper, &state.paths).await;
    let body_str = body.as_deref();
    let (candidates, _) = extract_candidates(&paper, &PaperRepo::new(&state.pool), body_str)
        .await
        .map_err(|e| e.to_string())?;
    if candidates.is_empty() {
        return Ok(Vec::new());
    }
    let payload = pending_payload(candidates);
    let repo = PaperTermRepo::new(&state.pool);
    let stored = repo
        .replace_for_paper(&paper_id, &payload)
        .await
        .map_err(|e| e.to_string())?;
    enrich_terms(&repo, &paper_id, stored)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_terms_explain(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
) -> Result<Vec<ReaderPaperTerm>, String> {
    let repo = PaperTermRepo::new(&state.pool);
    let existing = repo
        .list_by_paper(&paper_id)
        .await
        .map_err(|e| e.to_string())?;
    if existing.is_empty() {
        return Ok(Vec::new());
    }
    let paper = PaperRepo::new(&state.pool)
        .get(&paper_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "paper not found".to_string())?;
    let body = extract_pdf_body(&paper, &state.paths).await;
    let mut sections = weighted_metadata_sections(&paper);
    sections.extend(weighted_body_sections(body.as_deref()));
    let abbrev_long = extract_abbrev_pairs(&sections).map_err(|e| e.to_string())?;
    let candidates = existing
        .iter()
        .filter(|term| is_explainable_existing_term(term))
        .map(|term| CandidateTerm {
            term: term.term.clone(),
            score: term.score,
            local_evidence: term.local_evidence.clone(),
        })
        .collect::<Vec<_>>();
    let defs = explain_terms(&state, &paper, &candidates, &abbrev_long)
        .await
        .map_err(|e| e.to_string())?;
    for term in &existing {
        if !is_explainable_existing_term(term) {
            repo.delete(&paper_id, term.id)
                .await
                .map_err(|e| e.to_string())?;
            continue;
        }
        let definition = defs
            .get(&term.term)
            .cloned()
            .unwrap_or_else(|| fallback_definition_for(&term.term));
        repo.update_definition(&paper_id, &term.normalized_term, &definition)
            .await
            .map_err(|e| e.to_string())?;
    }
    let stored = repo
        .list_by_paper(&paper_id)
        .await
        .map_err(|e| e.to_string())?;
    enrich_terms(&repo, &paper_id, stored)
        .await
        .map_err(|e| e.to_string())
}

/// Manually add a single term to the paper's library. If `definition` is empty
/// we fall back to the same LLM explainer used by the auto generator. The new
/// row is upserted by normalized form so repeated additions of the same surface
/// form don't multiply.
#[tauri::command]
pub async fn paper_term_add(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    term: String,
    definition: Option<String>,
    evidence: Option<String>,
) -> Result<ReaderPaperTerm, String> {
    let trimmed = term.trim();
    if trimmed.is_empty() {
        return Err("term must not be empty".into());
    }
    let paper = PaperRepo::new(&state.pool)
        .get(&paper_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "paper not found".to_string())?;
    let evidence_text = match evidence
        .map(|e| e.trim().to_string())
        .filter(|s| !s.is_empty())
    {
        Some(text) => text,
        None => {
            let body = extract_pdf_body(&paper, &state.paths).await;
            first_evidence(&paper, body.as_deref(), trimmed)
        }
    };
    let definition_text = match definition
        .map(|d| d.trim().to_string())
        .filter(|s| !s.is_empty())
    {
        Some(text) => text,
        None => {
            let candidate = CandidateTerm {
                term: trimmed.to_string(),
                score: 0.0,
                local_evidence: evidence_text.clone(),
            };
            let defs = explain_terms(
                &state,
                &paper,
                std::slice::from_ref(&candidate),
                &HashMap::new(),
            )
            .await
            .map_err(|e| e.to_string())?;
            defs.get(trimmed)
                .cloned()
                .unwrap_or_else(|| fallback_definition(&candidate))
        }
    };
    let repo = PaperTermRepo::new(&state.pool);
    let normalized = filter_normalize(trimmed);
    let row = repo
        .upsert_one(
            &paper_id,
            &NewPaperTerm {
                term: trimmed.to_string(),
                normalized_term: normalized,
                local_definition: definition_text,
                local_evidence: evidence_text,
                // Manually-added terms outrank auto-extracted ones — give them
                // a generous base score so they pin to the top of the list.
                score: 1_000.0,
            },
        )
        .await
        .map_err(|e| e.to_string())?;
    let related = repo
        .related_by_normalized(&row.normalized_term, &paper_id, 3)
        .await
        .map_err(|e| e.to_string())?;
    Ok(ReaderPaperTerm {
        term: row,
        related,
        definition_status: "ready".to_string(),
    })
}

#[tauri::command]
pub async fn paper_term_delete(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    term_id: i64,
) -> Result<(), String> {
    PaperTermRepo::new(&state.pool)
        .delete(&paper_id, term_id)
        .await
        .map_err(|e| e.to_string())
}

/// Frontend hands us the text it pulled out of the PDF via pdfjs. We just
/// persist it next to the PDF so the term extractor can read it. PDF.js's
/// extractor is dramatically more reliable than lopdf on modern academic
/// PDFs (CMap-encoded fonts, embedded font subsets, content streams with
/// ToUnicode tables), so going through the renderer that's already loaded
/// in the reader gives us body text basically for free.
#[tauri::command]
pub async fn paper_set_pdf_text(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    text: String,
) -> Result<(), String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err("empty pdf text".into());
    }
    let dir = state.paths.paper_dir(&paper_id);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let cache_path = dir.join("text.txt");
    std::fs::write(&cache_path, trimmed).map_err(|e| e.to_string())?;
    Ok(())
}

async fn enrich_terms(
    repo: &PaperTermRepo<'_>,
    paper_id: &str,
    terms: Vec<PaperTerm>,
) -> Result<Vec<ReaderPaperTerm>> {
    let mut out = Vec::with_capacity(terms.len());
    for mut term in terms {
        let definition_status = if term.local_definition == PENDING_DEFINITION {
            term.local_definition.clear();
            "pending"
        } else {
            "ready"
        };
        let related = repo
            .related_by_normalized(&term.normalized_term, paper_id, 3)
            .await?;
        out.push(ReaderPaperTerm {
            term,
            related,
            definition_status: definition_status.to_string(),
        });
    }
    Ok(out)
}

fn is_explainable_existing_term(term: &PaperTerm) -> bool {
    is_term_candidate(&term.term) && !is_noise_term(&term.term)
}

#[derive(Clone)]
struct CandidateTerm {
    term: String,
    score: f64,
    local_evidence: String,
}

async fn extract_candidates(
    paper: &Paper,
    repo: &PaperRepo<'_>,
    body: Option<&str>,
) -> Result<(Vec<CandidateTerm>, HashMap<String, String>)> {
    let metadata = weighted_metadata_sections(paper);
    let body_sections = weighted_body_sections(body);
    let library = repo.list_recent(500).await.unwrap_or_default();
    let library_texts = library.iter().map(paper_text).collect::<Vec<_>>();
    // Lowercase set of every word that appears in an author name. Author
    // surnames like "Chen" / "Yang" / "Li" hit the single-token Title-Case
    // path in `is_term_candidate` and would otherwise rank high on
    // co-occurrence in author blocks. We just refuse to surface them.
    let mut author_tokens = std::collections::HashSet::<String>::new();
    for author in &paper.authors {
        for piece in author.split(|c: char| c.is_whitespace() || c == '-' || c == '.') {
            let token = piece.trim().to_lowercase();
            if token.len() >= 2 {
                author_tokens.insert(token);
            }
        }
    }
    // General phrase extraction is intentionally limited to curated metadata.
    // Full PDF body extraction focuses on abbreviations, which is the fast path
    // users expect from the reader term table.
    let phrase_re = Regex::new(r"\b[A-Za-z][A-Za-z0-9-]*(?: [A-Za-z0-9-]+)?\b")?;
    let abbrev_long = extract_abbrev_pairs(&body_sections)?;
    let mut tf = HashMap::<String, f64>::new();
    let mut surface = HashMap::<String, String>::new();
    let mut section_hits = HashMap::<String, u32>::new();
    let mut abbrev_bonus = HashMap::<String, f64>::new();
    // Maps normalized acronym → its trimmed full form, for the LLM explainer.
    // The user wants only the acronym to appear in the list; the long form
    // becomes context for the definition rather than its own term.
    for (norm, acro_raw, weight) in abbreviation_candidates(&body_sections, &abbrev_long) {
        if author_tokens.contains(&norm) || is_noise_term(&acro_raw) {
            continue;
        }
        *tf.entry(norm.clone()).or_insert(0.0) += weight;
        surface.entry(norm.clone()).or_insert(acro_raw);
        abbrev_bonus.insert(norm.clone(), 2.4);
        *section_hits.entry(norm).or_insert(0) += 1;
    }

    for (text, weight) in &metadata {
        let mut seen_in_section = std::collections::HashSet::<String>::new();
        for cap in phrase_re.find_iter(text) {
            let raw = cap.as_str().trim();
            if !is_term_candidate(raw) {
                continue;
            }
            let norm = filter_normalize(raw);
            if author_tokens.contains(&norm) || is_noise_term(raw) {
                continue;
            }
            *tf.entry(norm.clone()).or_insert(0.0) += *weight;
            surface
                .entry(norm.clone())
                .or_insert_with(|| raw.to_string());
            if seen_in_section.insert(norm.clone()) {
                *section_hits.entry(norm).or_insert(0) += 1;
            }
        }
    }
    let total_docs = library_texts.len().max(1) as f64;
    let mut ranked = tf
        .into_iter()
        .map(|(norm, freq)| {
            let df = library_texts
                .iter()
                .filter(|text| text.contains(&norm))
                .count() as f64;
            let idf = ((total_docs + 1.0) / (df + 1.0)).ln() + 1.0;
            let term = surface.get(&norm).cloned().unwrap_or(norm.clone());
            let diversity = (section_hits.get(&norm).copied().unwrap_or(1) as f64)
                .min(3.0)
                .sqrt();
            let quality = surface_quality_bonus(&term);
            let abbrev = abbrev_bonus.get(&norm).copied().unwrap_or(1.0);
            CandidateTerm {
                local_evidence: first_evidence(paper, body, &term),
                score: freq * idf * diversity * quality * abbrev,
                term,
            }
        })
        .filter(|candidate| {
            !candidate.local_evidence.is_empty() && candidate.score >= MIN_ACCEPT_SCORE
        })
        .collect::<Vec<_>>();
    ranked.sort_by(|a, b| b.score.total_cmp(&a.score));
    ranked.truncate(MAX_TERMS);
    Ok((ranked, abbrev_long))
}

/// Read the PDF body text cached by the frontend PDF.js renderer.
///
/// This intentionally does not fall back to backend `lopdf` extraction. Term
/// candidate generation must stay fast and visible; a slow full-PDF backend
/// parse would make the non-LLM phase look stuck. If the cache is not ready,
/// term generation still runs on title/abstract/deep-read metadata.
async fn extract_pdf_body(paper: &Paper, paths: &LibraryPaths) -> Option<String> {
    let cache_path = paths.paper_dir(&paper.id).join("text.txt");
    let cached = std::fs::read_to_string(cache_path).ok()?;
    if cached.trim().is_empty() {
        return None;
    }
    Some(cached)
}

/// Sanity-check a candidate `Full Name (ACRO)` pair. Real abbreviations have
/// their letters drawn (roughly) from the initial letters of the full form.
/// We accept the pair if at least half of the acronym letters match the
/// initials of the full form's content words, in order.
fn looks_like_abbrev_pair(full: &str, acronym: &str) -> bool {
    let acro_chars: Vec<char> = acronym
        .chars()
        .filter(|c| c.is_ascii_alphabetic())
        .map(|c| c.to_ascii_lowercase())
        .collect();
    if acro_chars.len() < 2 {
        return false;
    }
    let initials: Vec<char> = full
        .split(|c: char| c.is_whitespace() || c == '-')
        .filter_map(|word| word.chars().next())
        .filter(|c| c.is_ascii_alphabetic())
        .map(|c| c.to_ascii_lowercase())
        .collect();
    if initials.len() < acro_chars.len() {
        return false;
    }
    // Linear scan: for each acronym char, find it in remaining initials.
    let mut idx = 0usize;
    let mut hits = 0usize;
    for ch in &acro_chars {
        while idx < initials.len() && initials[idx] != *ch {
            idx += 1;
        }
        if idx < initials.len() {
            hits += 1;
            idx += 1;
        }
    }
    hits * 2 >= acro_chars.len()
}

/// Trim a captured full form down to the contiguous suffix whose initials
/// match the acronym exactly. Without this, the regex's greedy left-anchor
/// would keep an extra leading word like "average" in "average structural
/// similarity index measure (SSIM)" — we want "structural similarity index
/// measure" as the full form, since that's the name the acronym stands for.
fn refine_full_form(full: &str, acronym: &str) -> Option<String> {
    let acro_chars: Vec<char> = acronym
        .chars()
        .filter(|c| c.is_ascii_alphabetic())
        .map(|c| c.to_ascii_lowercase())
        .collect();
    if acro_chars.len() < 2 {
        return None;
    }
    let words: Vec<&str> = full.split_whitespace().collect();
    // First try the literal suffix of length = acronym letter count.
    if words.len() >= acro_chars.len() {
        let start = words.len() - acro_chars.len();
        let suffix = &words[start..];
        if matches_initials(suffix, &acro_chars) {
            return Some(suffix.join(" "));
        }
    }
    // Fallback: drop generic English stopwords ("and", "the", "of", ...) and
    // try again — useful for "Convolutional and Recurrent Neural Network (CRNN)".
    let content: Vec<&str> = words
        .iter()
        .filter(|w| {
            !crate::commands::term_filter::GENERIC_STOPWORDS.contains(&w.to_lowercase().as_str())
        })
        .copied()
        .collect();
    if content.len() >= acro_chars.len() {
        let start = content.len() - acro_chars.len();
        let suffix = &content[start..];
        if matches_initials(suffix, &acro_chars) {
            return Some(suffix.join(" "));
        }
    }
    None
}

fn matches_initials(words: &[&str], acro_chars: &[char]) -> bool {
    if words.len() != acro_chars.len() {
        return false;
    }
    words.iter().zip(acro_chars.iter()).all(|(word, ch)| {
        word.chars()
            .next()
            .map_or(false, |c| c.to_ascii_lowercase() == *ch)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refines_full_form_drops_leading_extra_word() {
        let refined = refine_full_form("average structural similarity index measure", "SSIM");
        assert_eq!(
            refined.as_deref(),
            Some("structural similarity index measure")
        );
    }

    #[test]
    fn refines_full_form_skips_internal_stopwords() {
        let refined = refine_full_form("convolutional and recurrent neural network", "CRNN");
        assert_eq!(
            refined.as_deref(),
            Some("convolutional recurrent neural network")
        );
    }

    #[test]
    fn refines_full_form_passthrough_when_already_clean() {
        let refined = refine_full_form("convolutional neural network", "CNN");
        assert_eq!(refined.as_deref(), Some("convolutional neural network"));
    }

    #[test]
    fn looks_like_pair_accepts_matching_initials() {
        assert!(looks_like_abbrev_pair(
            "structural similarity index measure",
            "SSIM"
        ));
        assert!(looks_like_abbrev_pair(
            "convolutional neural network",
            "CNN"
        ));
    }

    #[test]
    fn looks_like_pair_treats_hyphen_as_word_boundary() {
        // "Retrieval-Augmented Generation (RAG)" is a real-world abbreviation
        // pair. Splitting on whitespace alone gives 2 tokens and rejects the
        // pair; splitting on hyphen too gives the 3 initials we need.
        assert!(looks_like_abbrev_pair(
            "Retrieval-Augmented Generation",
            "RAG"
        ));
    }
}

async fn explain_terms(
    state: &State<'_, Arc<AppState>>,
    paper: &Paper,
    terms: &[CandidateTerm],
    abbrev_long: &HashMap<String, String>,
) -> Result<HashMap<String, String>> {
    let cfg = load_config(&state.paths)?;
    let profile = active_profile_for_task(&cfg, TaskKind::Tag)?;
    let items = terms
        .iter()
        .map(|term| {
            let norm = filter_normalize(&term.term);
            match abbrev_long.get(&norm) {
                Some(long) => format!(
                    "- {} (full form: {}) | evidence: {}",
                    term.term, long, term.local_evidence
                ),
                None => format!("- {} | evidence: {}", term.term, term.local_evidence),
            }
        })
        .collect::<Vec<_>>()
        .join("\n");
    let user_content = crate::ai::prompts::EXPLAIN_TERMS_USER
        .replace("{title}", &paper.title)
        .replace("{items}", &items);
    let resp = chat_complete(
        &state.http,
        &profile,
        &[
            ChatMessage {
                role: "system".into(),
                content: crate::ai::prompts::EXPLAIN_TERMS_SYSTEM.into(),
            },
            ChatMessage {
                role: "user".into(),
                content: user_content,
            },
        ],
    )
    .await?;
    let value = parse_json_lenient(&resp.content);
    let defs = definitions_array(&value)
        .ok_or_else(|| anyhow!("missing definitions array in LLM response: {}", truncate(&resp.content, 500)))?;
    let mut out = HashMap::new();
    for item in defs {
        let term = item
            .get("term")
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .trim();
        let definition = item
            .get("definition")
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .trim();
        if !term.is_empty() && !definition.is_empty() {
            out.insert(term.to_string(), definition.to_string());
        }
    }
    Ok(out)
}

fn extract_abbrev_pairs(sections: &[(String, f64)]) -> Result<HashMap<String, String>> {
    let abbrev_re = Regex::new(
        r"\b([A-Za-z][A-Za-z0-9-]*(?:\s+[A-Za-z][A-Za-z0-9-]*){1,4})\s*\(\s*([A-Z][A-Za-z0-9-]{1,8})\s*\)",
    )?;
    let mut pairs = HashMap::<String, String>::new();
    for (text, _) in sections {
        for cap in abbrev_re.captures_iter(text) {
            let full_raw = cap.get(1).map(|m| m.as_str().trim()).unwrap_or("");
            let acro_raw = cap.get(2).map(|m| m.as_str().trim()).unwrap_or("");
            let full_trimmed =
                refine_full_form(full_raw, acro_raw).unwrap_or_else(|| full_raw.to_string());
            if looks_like_abbrev_pair(&full_trimmed, acro_raw)
                && is_term_candidate_with(acro_raw, 1)
                && !is_noise_term(acro_raw)
                && !looks_like_layout_full_form(&full_trimmed)
            {
                pairs
                    .entry(filter_normalize(acro_raw))
                    .or_insert(full_trimmed);
            }
        }
    }
    Ok(pairs)
}

fn abbreviation_candidates(
    sections: &[(String, f64)],
    abbrev_long: &HashMap<String, String>,
) -> Vec<(String, String, f64)> {
    let mut out = Vec::new();
    for (norm, long) in abbrev_long {
        let surface = acronym_surface(norm);
        for (text, weight) in sections {
            let freq = count_ascii_case_insensitive(text, &surface);
            if freq > 0 {
                out.push((norm.clone(), surface.clone(), *weight * 3.0 * freq as f64));
            }
            if count_ascii_case_insensitive(text, long) > 0 {
                out.push((norm.clone(), surface.clone(), *weight));
            }
        }
    }
    out
}

fn weighted_metadata_sections(paper: &Paper) -> Vec<(String, f64)> {
    let mut sections = Vec::new();
    push_section(&mut sections, Some(&paper.title), 3.0);
    push_section(&mut sections, paper.abstract_text.as_deref(), 2.0);
    push_section(&mut sections, paper.method.as_deref(), 2.0);
    push_section(&mut sections, paper.research_question.as_deref(), 1.5);
    push_section(&mut sections, paper.dataset.as_deref(), 1.5);
    push_section(&mut sections, paper.comparison.as_deref(), 1.0);
    push_section(&mut sections, paper.limitations.as_deref(), 1.0);
    push_section(&mut sections, paper.tldr.as_deref(), 1.0);
    sections
}

fn weighted_body_sections(body: Option<&str>) -> Vec<(String, f64)> {
    let mut sections = Vec::new();
    push_section(&mut sections, body, 0.4);
    sections
}

fn push_section(out: &mut Vec<(String, f64)>, text: Option<&str>, weight: f64) {
    if let Some(text) = text.map(str::trim).filter(|text| !text.is_empty()) {
        out.push((text.to_string(), weight));
    }
}

fn first_evidence(paper: &Paper, body: Option<&str>, term: &str) -> String {
    let needle = term.to_ascii_lowercase();
    // Order: title → abstract → research question → method → comparison →
    // limitations → body. We prefer the curated summary sections because
    // their context lines are tighter, but fall back to the PDF body so
    // terms that only appear in the paper's body still get an evidence
    // snippet.
    let sources: [Option<&str>; 7] = [
        Some(paper.title.as_str()),
        paper.abstract_text.as_deref(),
        paper.research_question.as_deref(),
        paper.method.as_deref(),
        paper.comparison.as_deref(),
        paper.limitations.as_deref(),
        body,
    ];
    for text in sources.into_iter().flatten() {
        let lower = text.to_ascii_lowercase();
        if let Some(index) = find_ascii_word(&lower, &needle) {
            return evidence_window(text, index, needle.len());
        }
    }
    String::new()
}

fn evidence_window(text: &str, start: usize, len: usize) -> String {
    let from = previous_char_boundary(text, start.saturating_sub(CONTEXT_BEFORE_BYTES));
    let to = next_char_boundary(
        text,
        (start + len + CONTEXT_AFTER_BYTES).min(text.len()),
    );
    truncate(text[from..to].trim(), MAX_EVIDENCE_CHARS)
}

fn previous_char_boundary(text: &str, mut index: usize) -> usize {
    while index > 0 && !text.is_char_boundary(index) {
        index -= 1;
    }
    index
}

fn next_char_boundary(text: &str, mut index: usize) -> usize {
    while index < text.len() && !text.is_char_boundary(index) {
        index += 1;
    }
    index
}

fn acronym_surface(norm: &str) -> String {
    norm.to_ascii_uppercase()
}

fn count_ascii_case_insensitive(text: &str, needle: &str) -> usize {
    if needle.is_empty() {
        return 0;
    }
    let lower = text.to_ascii_lowercase();
    let lower_needle = needle.to_ascii_lowercase();
    ascii_word_matches(&lower, &lower_needle).count()
}

fn find_ascii_word(text: &str, needle: &str) -> Option<usize> {
    ascii_word_matches(text, needle).next()
}

fn ascii_word_matches<'a>(text: &'a str, needle: &'a str) -> impl Iterator<Item = usize> + 'a {
    text.match_indices(needle)
        .filter(move |(index, _)| is_ascii_word_hit(text, *index, needle.len()))
        .map(|(index, _)| index)
}

fn is_ascii_word_hit(text: &str, start: usize, len: usize) -> bool {
    let before = text[..start].chars().next_back();
    let after = text[start + len..].chars().next();
    !before.map_or(false, is_ascii_word_char) && !after.map_or(false, is_ascii_word_char)
}

fn is_ascii_word_char(ch: char) -> bool {
    ch.is_ascii_alphanumeric() || ch == '_' || ch == '-'
}

fn is_noise_term(raw: &str) -> bool {
    let trimmed = raw.trim_matches(|ch: char| !ch.is_ascii_alphanumeric());
    if trimmed.is_empty() {
        return true;
    }
    if NOISE_ACRONYMS.contains(&trimmed) {
        return true;
    }
    NOISE_TERMS.contains(&trimmed.to_ascii_lowercase().as_str())
}

fn looks_like_layout_full_form(full: &str) -> bool {
    let normalized = full.to_ascii_lowercase();
    NOISE_TERMS
        .iter()
        .any(|term| ascii_word_matches(&normalized, term).next().is_some())
}

fn pending_payload(candidates: Vec<CandidateTerm>) -> Vec<NewPaperTerm> {
    candidates
        .into_iter()
        .map(|term| NewPaperTerm {
            normalized_term: filter_normalize(&term.term),
            term: term.term,
            local_definition: PENDING_DEFINITION.to_string(),
            local_evidence: term.local_evidence,
            score: term.score,
        })
        .collect()
}

fn fallback_definition(term: &CandidateTerm) -> String {
    fallback_definition_for(&term.term)
}

fn fallback_definition_for(term: &str) -> String {
    format!("本文将 {term} 放在当前论证或方法上下文中使用。")
}

fn paper_text(paper: &Paper) -> String {
    [
        Some(paper.title.as_str()),
        paper.abstract_text.as_deref(),
        paper.method.as_deref(),
        paper.research_question.as_deref(),
        paper.comparison.as_deref(),
        paper.limitations.as_deref(),
        paper.dataset.as_deref(),
        paper.tldr.as_deref(),
    ]
    .into_iter()
    .flatten()
    .map(filter_normalize)
    .collect::<Vec<_>>()
    .join(" ")
}

fn truncate(text: &str, max_chars: usize) -> String {
    if text.chars().count() <= max_chars {
        return text.to_string();
    }
    let mut clipped = text.chars().take(max_chars).collect::<String>();
    clipped.push_str("...");
    clipped
}

fn parse_json_lenient(raw: &str) -> serde_json::Value {
    crate::ai::json_utils::parse_lenient_value(raw)
}

fn definitions_array(value: &serde_json::Value) -> Option<&Vec<serde_json::Value>> {
    if let Some(items) = value.get("definitions").and_then(|items| items.as_array()) {
        return Some(items);
    }
    value.as_array()
}
