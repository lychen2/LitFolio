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
/// Minimum quality-weighted score for a candidate to be eligible. Calibrated so
/// a single appearance of a lowercase bigram (tf=1, idf≈1, bonus=0.7) sits at
/// ~0.7 and gets dropped, while a Title-Case 3-gram appearing once still passes.
const MIN_ACCEPT_SCORE: f64 = 0.9;

#[derive(Debug, Clone, Serialize)]
pub struct ReaderPaperTerm {
    pub term: PaperTerm,
    pub related: Vec<RelatedPaperTerm>,
}

#[tauri::command]
pub async fn paper_terms_list(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
) -> Result<Vec<ReaderPaperTerm>, String> {
    let repo = PaperTermRepo::new(&state.pool);
    let terms = repo.list_by_paper(&paper_id).await.map_err(|e| e.to_string())?;
    enrich_terms(&repo, &paper_id, terms).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_terms_generate(
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
    let (candidates, abbrev_long) =
        extract_candidates(&paper, &PaperRepo::new(&state.pool), body_str)
            .await
            .map_err(|e| e.to_string())?;
    if candidates.is_empty() {
        return Ok(Vec::new());
    }
    let defs = explain_terms(&state, &paper, &candidates, &abbrev_long)
        .await
        .map_err(|e| e.to_string())?;
    let payload = candidates
        .into_iter()
        .map(|term| NewPaperTerm {
            normalized_term: filter_normalize(&term.term),
            term: term.term.clone(),
            local_definition: defs.get(&term.term).cloned().unwrap_or_else(|| fallback_definition(&term)),
            local_evidence: term.local_evidence,
            score: term.score,
        })
        .collect::<Vec<_>>();
    let repo = PaperTermRepo::new(&state.pool);
    let stored = repo
        .replace_for_paper(&paper_id, &payload)
        .await
        .map_err(|e| e.to_string())?;
    enrich_terms(&repo, &paper_id, stored).await.map_err(|e| e.to_string())
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
    let definition_text = match definition.map(|d| d.trim().to_string()).filter(|s| !s.is_empty()) {
        Some(text) => text,
        None => {
            let candidate = CandidateTerm {
                term: trimmed.to_string(),
                score: 0.0,
                local_evidence: evidence_text.clone(),
            };
            let defs = explain_terms(&state, &paper, std::slice::from_ref(&candidate), &HashMap::new())
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
    Ok(ReaderPaperTerm { term: row, related })
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
    for term in terms {
        let related = repo
            .related_by_normalized(&term.normalized_term, paper_id, 3)
            .await?;
        out.push(ReaderPaperTerm { term, related });
    }
    Ok(out)
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
    let corpus = weighted_sections(paper, body);
    let library = repo.list_recent(500).await.unwrap_or_default();
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
    // 1-2 word noun-phrase shape: starts with a letter, allows hyphenated tail
    // words. Default ceiling is 2 words; longer phrases come in via the
    // abbreviation-pair scan below.
    let phrase_re = Regex::new(r"\b[A-Za-z][A-Za-z0-9-]*(?: [A-Za-z0-9-]+)?\b")?;
    let abbrev_re = Regex::new(
        r"\b([A-Za-z][A-Za-z0-9-]*(?:\s+[A-Za-z][A-Za-z0-9-]*){1,4})\s*\(\s*([A-Z][A-Za-z0-9-]{1,8})\s*\)",
    )?;
    let mut tf = HashMap::<String, f64>::new();
    let mut surface = HashMap::<String, String>::new();
    let mut section_hits = HashMap::<String, u32>::new();
    let mut abbrev_bonus = HashMap::<String, f64>::new();
    // Maps normalized acronym → its trimmed full form, for the LLM explainer.
    // The user wants only the acronym to appear in the list; the long form
    // becomes context for the definition rather than its own term.
    let mut abbrev_long = HashMap::<String, String>::new();

    for (text, weight) in &corpus {
        // Abbreviation pairs: only the ACRONYM enters the candidate pool. The
        // refined full form is stashed for the LLM definition pass so the
        // explainer can write "SSIM (Structural Similarity Index Measure)
        // is …" without duplicating the entry.
        for cap in abbrev_re.captures_iter(text) {
            let full_raw = cap.get(1).map(|m| m.as_str().trim()).unwrap_or("");
            let acro_raw = cap.get(2).map(|m| m.as_str().trim()).unwrap_or("");
            let full_trimmed = refine_full_form(full_raw, acro_raw)
                .unwrap_or_else(|| full_raw.to_string());
            if !looks_like_abbrev_pair(&full_trimmed, acro_raw) {
                continue;
            }
            if !is_term_candidate_with(acro_raw, 1) {
                continue;
            }
            let norm = filter_normalize(acro_raw);
            if author_tokens.contains(&norm) {
                continue;
            }
            *tf.entry(norm.clone()).or_insert(0.0) += *weight * 2.0;
            surface.entry(norm.clone()).or_insert_with(|| acro_raw.to_string());
            abbrev_bonus.insert(norm.clone(), 1.8);
            abbrev_long.entry(norm.clone()).or_insert(full_trimmed);
            *section_hits.entry(norm).or_insert(0) += 1;
        }

        let mut seen_in_section = std::collections::HashSet::<String>::new();
        for cap in phrase_re.find_iter(text) {
            let raw = cap.as_str().trim();
            if !is_term_candidate(raw) {
                continue;
            }
            let norm = filter_normalize(raw);
            if author_tokens.contains(&norm) {
                continue;
            }
            *tf.entry(norm.clone()).or_insert(0.0) += *weight;
            surface.entry(norm.clone()).or_insert_with(|| raw.to_string());
            if seen_in_section.insert(norm.clone()) {
                *section_hits.entry(norm).or_insert(0) += 1;
            }
        }
    }
    let total_docs = library.len().max(1) as f64;
    let mut ranked = tf
        .into_iter()
        .map(|(norm, freq)| {
            let df = library
                .iter()
                .filter(|candidate_paper| paper_text(candidate_paper).contains(&norm))
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
        .filter(|candidate| !candidate.local_evidence.is_empty() && candidate.score >= MIN_ACCEPT_SCORE)
        .collect::<Vec<_>>();
    ranked.sort_by(|a, b| b.score.total_cmp(&a.score));
    ranked.truncate(MAX_TERMS);
    Ok((ranked, abbrev_long))
}

/// Extract the PDF body text and cache it next to the original PDF. Subsequent
/// calls reuse the cached file as long as it's newer than the PDF. Returns
/// None if no PDF is bound or extraction fails — term generation still works
/// off the metadata sections in that case.
async fn extract_pdf_body(paper: &Paper, paths: &LibraryPaths) -> Option<String> {
    let pdf_path = paper.pdf_path.as_deref().filter(|p| !p.is_empty())?;
    let cache_path = paths.paper_dir(&paper.id).join("text.txt");
    if let (Ok(pdf_meta), Ok(cache_meta)) =
        (std::fs::metadata(pdf_path), std::fs::metadata(&cache_path))
    {
        if let (Ok(pdf_mod), Ok(cache_mod)) = (pdf_meta.modified(), cache_meta.modified()) {
            if cache_mod >= pdf_mod {
                if let Ok(cached) = std::fs::read_to_string(&cache_path) {
                    if !cached.trim().is_empty() {
                        return Some(cached);
                    }
                }
            }
        }
    }
    let bytes = std::fs::read(pdf_path).ok()?;
    let cache_path_owned = cache_path.clone();
    let extracted = tokio::task::spawn_blocking(move || -> Option<String> {
        let doc = lopdf::Document::load_mem(&bytes).ok()?;
        let pages = doc.get_pages();
        let page_ids: Vec<u32> = pages.values().map(|id| id.0).collect();
        doc.extract_text(&page_ids).ok()
    })
    .await
    .ok()??;
    let _ = std::fs::write(&cache_path_owned, &extracted);
    Some(extracted)
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
            !crate::commands::term_filter::GENERIC_STOPWORDS
                .contains(&w.to_lowercase().as_str())
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
        assert_eq!(refined.as_deref(), Some("structural similarity index measure"));
    }

    #[test]
    fn refines_full_form_skips_internal_stopwords() {
        let refined = refine_full_form("convolutional and recurrent neural network", "CRNN");
        assert_eq!(refined.as_deref(), Some("convolutional recurrent neural network"));
    }

    #[test]
    fn refines_full_form_passthrough_when_already_clean() {
        let refined = refine_full_form("convolutional neural network", "CNN");
        assert_eq!(refined.as_deref(), Some("convolutional neural network"));
    }

    #[test]
    fn looks_like_pair_accepts_matching_initials() {
        assert!(looks_like_abbrev_pair("structural similarity index measure", "SSIM"));
        assert!(looks_like_abbrev_pair("convolutional neural network", "CNN"));
    }

    #[test]
    fn looks_like_pair_treats_hyphen_as_word_boundary() {
        // "Retrieval-Augmented Generation (RAG)" is a real-world abbreviation
        // pair. Splitting on whitespace alone gives 2 tokens and rejects the
        // pair; splitting on hyphen too gives the 3 initials we need.
        assert!(looks_like_abbrev_pair("Retrieval-Augmented Generation", "RAG"));
    }
}

async fn explain_terms(
    state: &State<'_, Arc<AppState>>,
    paper: &Paper,
    terms: &[CandidateTerm],
    abbrev_long: &HashMap<String, String>,
) -> Result<HashMap<String, String>> {
    let cfg = load_config(&state.paths)?;
    let profile = active_profile_for_task(&cfg, TaskKind::Tldr)?;
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
    let user_content = format!(
        "Paper title: {}\n\nTerms:\n{}\n\nReturn ONLY JSON: {{\"definitions\": [{{\"term\": \"...\", \"definition\": \"...\"}}]}}.\nRules:\n- Write Chinese definitions.\n- Each definition must be one short sentence.\n- Explain how the term is used in this paper, not a generic dictionary entry.\n- For acronyms with a known full form, surface the full form in the first clause of the definition (e.g. \"SSIM (Structural Similarity Index Measure) 在本文中…\").\n- Do not include terms that are not in the input list.",
        paper.title, items
    );
    let resp = chat_complete(
        &state.http,
        &profile,
        &[
            ChatMessage {
                role: "system".into(),
                content: "You explain technical terms for an academic reading workspace.".into(),
            },
            ChatMessage {
                role: "user".into(),
                content: user_content,
            },
        ],
    )
    .await?;
    let value = parse_json_lenient(&resp.content);
    let defs = value
        .get("definitions")
        .and_then(|items| items.as_array())
        .ok_or_else(|| anyhow!("missing definitions array"))?;
    let mut out = HashMap::new();
    for item in defs {
        let term = item.get("term").and_then(|value| value.as_str()).unwrap_or("").trim();
        let definition = item.get("definition").and_then(|value| value.as_str()).unwrap_or("").trim();
        if !term.is_empty() && !definition.is_empty() {
            out.insert(term.to_string(), definition.to_string());
        }
    }
    Ok(out)
}

fn weighted_sections<'a>(paper: &'a Paper, body: Option<&'a str>) -> Vec<(String, f64)> {
    let mut sections = Vec::new();
    push_section(&mut sections, Some(&paper.title), 3.0);
    push_section(&mut sections, paper.abstract_text.as_deref(), 2.0);
    push_section(&mut sections, paper.method.as_deref(), 2.0);
    push_section(&mut sections, paper.research_question.as_deref(), 1.5);
    push_section(&mut sections, paper.dataset.as_deref(), 1.5);
    push_section(&mut sections, paper.comparison.as_deref(), 1.0);
    push_section(&mut sections, paper.limitations.as_deref(), 1.0);
    push_section(&mut sections, paper.tldr.as_deref(), 1.0);
    // Full PDF body at lower per-occurrence weight than the curated summary
    // sections: it's where acronyms like "LSF", "RAG", "CST" actually live,
    // but it also contains a lot of citation text that we don't want to
    // overpower the title/abstract signal.
    push_section(&mut sections, body, 0.4);
    sections
}

fn push_section(out: &mut Vec<(String, f64)>, text: Option<&str>, weight: f64) {
    if let Some(text) = text.map(str::trim).filter(|text| !text.is_empty()) {
        out.push((text.to_string(), weight));
    }
}

fn first_evidence(paper: &Paper, body: Option<&str>, term: &str) -> String {
    let needle = term.to_lowercase();
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
        let lower = text.to_lowercase();
        if let Some(index) = lower.find(&needle) {
            let start = index.saturating_sub(60);
            let end = (index + term.len() + 80).min(text.len());
            return truncate(text[start..end].trim(), MAX_EVIDENCE_CHARS);
        }
    }
    String::new()
}

fn fallback_definition(term: &CandidateTerm) -> String {
    format!("本文将 {} 放在当前论证或方法上下文中使用。", term.term)
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
    let trimmed = raw.trim();
    let body = trimmed
        .strip_prefix("```json")
        .or_else(|| trimmed.strip_prefix("```"))
        .unwrap_or(trimmed)
        .trim_start_matches('\n')
        .trim_end_matches("```")
        .trim();
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(body) {
        return value;
    }
    if let (Some(start), Some(end)) = (body.find('{'), body.rfind('}')) {
        if start < end {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&body[start..=end]) {
                return value;
            }
        }
    }
    serde_json::json!({})
}
