//! Shared rules for deciding whether a noun-phrase candidate looks like a real
//! term worth surfacing in the reader UI. The previous regex-only extractor was
//! happy to capture sentence fragments such as "with three independent" or
//! "inspect and repair", because its only safeguards were a tiny stopword list
//! plus "must be multi-word OR contain uppercase". This module tightens that.
//!
//! The filter is intentionally generous to *named* concepts (Title Case, all-
//! caps acronyms, hyphenated technical compounds) and harsh on bare lowercase
//! N-grams that start or end with function words.

mod constants;

pub use constants::GENERIC_STOPWORDS;
use constants::MIDDLE_BANNED;

/// Default ceiling for general term extraction. Set to 1 so the default term
/// set is "single named tokens only" (Title-Case proper nouns, all-caps
/// acronyms, hyphenated compounds). Multi-word terms only come in through the
/// explicit abbreviation-pair path — that's where the "Full Name (ACRO)"
/// rendering signals "this really is a named concept".
pub const DEFAULT_MAX_PHRASE_WORDS: usize = 1;
pub const MIN_PHRASE_LEN: usize = 2;
pub const MAX_PHRASE_LEN: usize = 64;

/// Decide whether `raw` (already extracted by a regex) survives as a term
/// candidate. The check is conservative: when in doubt, drop. `max_words`
/// lets callers raise the per-phrase ceiling — for example, expanded acronym
/// full forms are allowed to be longer than the default 2 words.
pub fn is_term_candidate_with(raw: &str, max_words: usize) -> bool {
    let term = raw.trim_matches(|ch: char| !ch.is_alphanumeric());
    if term.len() < MIN_PHRASE_LEN || term.len() > MAX_PHRASE_LEN {
        return false;
    }
    let words: Vec<&str> = term.split_whitespace().collect();
    if words.is_empty() || words.len() > max_words {
        return false;
    }
    let lower: Vec<String> = words.iter().map(|w| w.to_lowercase()).collect();

    // First & last word cannot be a generic English function word — that's
    // what turns a slice of prose into a sentence fragment.
    if GENERIC_STOPWORDS.contains(&lower[0].as_str()) {
        return false;
    }
    if GENERIC_STOPWORDS.contains(&lower[lower.len() - 1].as_str()) {
        return false;
    }

    // Coordinating conjunctions in the middle of a 3+-word phrase signal a
    // verb-object boundary, not a noun phrase.
    if lower.len() >= 3 {
        for w in &lower[1..lower.len() - 1] {
            if MIDDLE_BANNED.contains(&w.as_str()) {
                return false;
            }
        }
    }

    let has_upper = term.chars().any(|ch| ch.is_uppercase());
    let has_hyphen = term.contains('-');

    if words.len() == 1 {
        if lower[0].ends_with("ly") && !term.chars().all(|c| c.is_ascii_uppercase()) {
            return false;
        }
        // Acronyms ("AI", "CNN", "SSIM") are short by definition — allow
        // 2-8 chars of all-caps letters/digits with optional hyphen.
        let is_acronym = term.len() >= 2
            && term.len() <= 8
            && term
                .chars()
                .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '-')
            && term.chars().any(|c| c.is_ascii_uppercase());
        if is_acronym {
            return true;
        }
        // Non-acronym single tokens need to be at least 4 chars long and
        // signal "named concept" via capitalization or an internal hyphen.
        if term.len() < 4 {
            return false;
        }
        return has_upper || has_hyphen;
    }

    // Multi-word: every internal word must carry signal — reject phrases that
    // sneak a 1-2 char filler word in (e.g. "as a system", "is a method").
    if lower.iter().any(|w| w.len() < 3) {
        return false;
    }

    // Don't surface generic noun chunks like "research method" or "case study".
    let non_generic = lower
        .iter()
        .any(|w| !GENERIC_STOPWORDS.contains(&w.as_str()));
    if !non_generic {
        return false;
    }

    true
}

/// Default-ceiling shortcut: caps at 2 words. Use this for general extraction
/// where 3+ word phrases are usually sentence fragments.
pub fn is_term_candidate(raw: &str) -> bool {
    is_term_candidate_with(raw, DEFAULT_MAX_PHRASE_WORDS)
}

/// Normalize a surface form for dedup + cross-paper joins. Collapses whitespace
/// and lowercases. Keeps hyphens because they're meaningful in compounds.
pub fn normalize_term(raw: &str) -> String {
    raw.to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Quality multiplier applied on top of raw TF-IDF. Rewards surface features
/// that correlate with "this is a named technical concept, not a noun chunk":
/// proper-noun capitalization, all-caps acronyms, internal hyphens.
pub fn surface_quality_bonus(raw: &str) -> f64 {
    let trimmed = raw.trim();
    let words: Vec<&str> = trimmed.split_whitespace().collect();
    let mut score = 1.0;

    let has_upper = trimmed.chars().any(|ch| ch.is_uppercase());
    let has_hyphen = trimmed.contains('-');

    // All-caps acronym (SSIM, RGB, CNN). The 8-char ceiling avoids matching
    // accidental shouting in figure captions.
    let is_acronym = trimmed.len() <= 8
        && trimmed
            .chars()
            .all(|ch| ch.is_ascii_uppercase() || ch.is_ascii_digit() || ch == '-');
    if is_acronym {
        score *= 2.0;
    }

    // Title-case multi-word terms ("Agentic Metasurface Design").
    let title_case_words = words
        .iter()
        .filter(|w| w.chars().next().is_some_and(|c| c.is_uppercase()))
        .count();
    if words.len() >= 2 && title_case_words >= 2 {
        score *= 1.6;
    } else if has_upper && words.len() >= 2 {
        score *= 1.2;
    }

    if has_hyphen {
        score *= 1.3;
    }

    // Pure lowercase multi-word: real terms exist ("frequency mapping") but
    // they're rarer, so trim their score a bit so named concepts surface
    // first.
    if !has_upper && !has_hyphen && words.len() >= 2 {
        score *= 0.7;
    }

    score
}

#[cfg(test)]
mod tests;
