//! Candidate term extraction for the reader term table.
//!
//! Combines weighted metadata sections, abbreviation candidates, and
//! TF-IDF scoring to produce a ranked list of term candidates. Depends on
//! `abbrev` for abbreviation detection and `evidence` for text helpers.

use std::collections::HashMap;

use anyhow::Result;
use regex::Regex;

use super::{abbrev, evidence};
use crate::commands::term_filter;
use crate::storage::{Paper, PaperRepo};

pub(super) const MAX_TERMS: usize = 12;
const MIN_ACCEPT_SCORE: f64 = 0.9;

#[derive(Clone)]
pub(super) struct CandidateTerm {
    pub term: String,
    pub score: f64,
    pub local_evidence: String,
}

pub(super) async fn extract_candidates(
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
    let abbrev_long = abbrev::extract_abbrev_pairs(&body_sections)?;
    let mut tf = HashMap::<String, f64>::new();
    let mut surface = HashMap::<String, String>::new();
    let mut section_hits = HashMap::<String, u32>::new();
    let mut abbrev_bonus = HashMap::<String, f64>::new();
    // Maps normalized acronym → its trimmed full form, for the LLM explainer.
    // The user wants only the acronym to appear in the list; the long form
    // becomes context for the definition rather than its own term.
    for (norm, acro_raw, weight) in abbrev::abbreviation_candidates(&body_sections, &abbrev_long) {
        if author_tokens.contains(&norm) || evidence::is_noise_term(&acro_raw) {
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
            if !term_filter::is_term_candidate(raw) {
                continue;
            }
            let norm = term_filter::normalize_term(raw);
            if author_tokens.contains(&norm) || evidence::is_noise_term(raw) {
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
            let quality = term_filter::surface_quality_bonus(&term);
            let abbrev = abbrev_bonus.get(&norm).copied().unwrap_or(1.0);
            CandidateTerm {
                local_evidence: evidence::first_evidence(paper, body, &term),
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

pub(super) fn pending_payload(candidates: Vec<CandidateTerm>) -> Vec<crate::storage::NewPaperTerm> {
    candidates
        .into_iter()
        .map(|term| crate::storage::NewPaperTerm {
            normalized_term: term_filter::normalize_term(&term.term),
            term: term.term,
            local_definition: PENDING_DEFINITION.to_string(),
            local_evidence: term.local_evidence,
            score: term.score,
        })
        .collect()
}

pub(super) fn weighted_metadata_sections(paper: &Paper) -> Vec<(String, f64)> {
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

pub(super) fn weighted_body_sections(body: Option<&str>) -> Vec<(String, f64)> {
    let mut sections = Vec::new();
    push_section(&mut sections, body, 0.4);
    sections
}

fn push_section(out: &mut Vec<(String, f64)>, text: Option<&str>, weight: f64) {
    if let Some(text) = text.map(str::trim).filter(|text| !text.is_empty()) {
        out.push((text.to_string(), weight));
    }
}

pub(super) fn paper_text(paper: &Paper) -> String {
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
    .map(term_filter::normalize_term)
    .collect::<Vec<_>>()
    .join(" ")
}

pub(super) const PENDING_DEFINITION: &str = "__litera_pending_llm_definition__";
