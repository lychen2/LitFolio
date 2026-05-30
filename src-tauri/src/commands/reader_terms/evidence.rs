//! Local text utilities for the reader term extractor: PDF body cache reads,
//! evidence-window extraction, ASCII word-boundary matching, and noise-term
//! filtering. Lowest-level helpers — no dependency on the other reader-term
//! submodules.

use crate::storage::{LibraryPaths, Paper};

const MAX_EVIDENCE_CHARS: usize = 180;
const CONTEXT_BEFORE_BYTES: usize = 60;
const CONTEXT_AFTER_BYTES: usize = 80;
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

/// Read the PDF body text cached by the frontend PDF.js renderer.
///
/// This intentionally does not fall back to backend `lopdf` extraction. Term
/// candidate generation must stay fast and visible; a slow full-PDF backend
/// parse would make the non-LLM phase look stuck. If the cache is not ready,
/// term generation still runs on title/abstract/deep-read metadata.
pub(super) async fn extract_pdf_body(paper: &Paper, paths: &LibraryPaths) -> Option<String> {
    let cache_path = paths.paper_dir(&paper.id).join("text.txt");
    let cached = std::fs::read_to_string(cache_path).ok()?;
    if cached.trim().is_empty() {
        return None;
    }
    Some(cached)
}

pub(super) fn first_evidence(paper: &Paper, body: Option<&str>, term: &str) -> String {
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
    let to = next_char_boundary(text, (start + len + CONTEXT_AFTER_BYTES).min(text.len()));
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

pub(super) fn count_ascii_case_insensitive(text: &str, needle: &str) -> usize {
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

pub(super) fn is_noise_term(raw: &str) -> bool {
    let trimmed = raw.trim_matches(|ch: char| !ch.is_ascii_alphanumeric());
    if trimmed.is_empty() {
        return true;
    }
    if NOISE_ACRONYMS.contains(&trimmed) {
        return true;
    }
    NOISE_TERMS.contains(&trimmed.to_ascii_lowercase().as_str())
}

pub(super) fn looks_like_layout_full_form(full: &str) -> bool {
    let normalized = full.to_ascii_lowercase();
    NOISE_TERMS
        .iter()
        .any(|term| ascii_word_matches(&normalized, term).next().is_some())
}

pub(super) fn truncate(text: &str, max_chars: usize) -> String {
    if text.chars().count() <= max_chars {
        return text.to_string();
    }
    let mut clipped = text.chars().take(max_chars).collect::<String>();
    clipped.push_str("...");
    clipped
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn truncate_handles_multibyte_boundary_without_panicking() {
        // Truncation counts chars, not bytes — clipping mid-CJK must not panic.
        let text = "结构相似性指数测量方法说明";
        let clipped = truncate(text, 4);
        assert_eq!(clipped, "结构相似...");
    }

    #[test]
    fn count_ascii_case_insensitive_requires_word_boundary() {
        // "cat" must not match inside "concatenate".
        assert_eq!(count_ascii_case_insensitive("concatenate cat", "cat"), 1);
        assert_eq!(count_ascii_case_insensitive("CAT cat Cat", "cat"), 3);
    }

    #[test]
    fn is_noise_term_flags_layout_words_and_acronyms() {
        assert!(is_noise_term("Figure"));
        assert!(is_noise_term("PDF"));
        assert!(!is_noise_term("transformer"));
    }
}
