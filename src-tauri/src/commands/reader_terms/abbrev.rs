//! Abbreviation recognition for the reader term extractor.
//!
//! Detects "Full Name (ACRO)" patterns in text, validates the pair with
//! initial-matching heuristics, and generates weighted candidates from
//! abbreviation occurrences.

use std::collections::HashMap;

use anyhow::Result;
use regex::Regex;

use super::evidence;
use crate::commands::term_filter;

/// Sanity-check a candidate `Full Name (ACRO)` pair. Real abbreviations have
/// their letters drawn (roughly) from the initial letters of the full form.
/// We accept the pair if at least half of the acronym letters match the
/// initials of the full form's content words, in order.
pub(super) fn looks_like_abbrev_pair(full: &str, acronym: &str) -> bool {
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
pub(super) fn refine_full_form(full: &str, acronym: &str) -> Option<String> {
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
            .is_some_and(|c| c.to_ascii_lowercase() == *ch)
    })
}

fn acronym_surface(norm: &str) -> String {
    norm.to_ascii_uppercase()
}

pub(super) fn extract_abbrev_pairs(sections: &[(String, f64)]) -> Result<HashMap<String, String>> {
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
                && term_filter::is_term_candidate_with(acro_raw, 1)
                && !evidence::is_noise_term(acro_raw)
                && !evidence::looks_like_layout_full_form(&full_trimmed)
            {
                pairs
                    .entry(term_filter::normalize_term(acro_raw))
                    .or_insert(full_trimmed);
            }
        }
    }
    Ok(pairs)
}

pub(super) fn abbreviation_candidates(
    sections: &[(String, f64)],
    abbrev_long: &HashMap<String, String>,
) -> Vec<(String, String, f64)> {
    let mut out = Vec::new();
    for (norm, long) in abbrev_long {
        let surface = acronym_surface(norm);
        for (text, weight) in sections {
            let freq = evidence::count_ascii_case_insensitive(text, &surface);
            if freq > 0 {
                out.push((norm.clone(), surface.clone(), *weight * 3.0 * freq as f64));
            }
            if evidence::count_ascii_case_insensitive(text, long) > 0 {
                out.push((norm.clone(), surface.clone(), *weight));
            }
        }
    }
    out
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
        assert!(looks_like_abbrev_pair(
            "Retrieval-Augmented Generation",
            "RAG"
        ));
    }
}
