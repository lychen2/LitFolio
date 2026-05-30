//! Shared rules for deciding whether a noun-phrase candidate looks like a real
//! term worth surfacing in the reader UI. The previous regex-only extractor was
//! happy to capture sentence fragments such as "with three independent" or
//! "inspect and repair", because its only safeguards were a tiny stopword list
//! plus "must be multi-word OR contain uppercase". This module tightens that.
//!
//! The filter is intentionally generous to *named* concepts (Title Case, all-
//! caps acronyms, hyphenated technical compounds) and harsh on bare lowercase
//! N-grams that start or end with function words.

/// Default ceiling for general term extraction. Set to 1 so the default term
/// set is "single named tokens only" (Title-Case proper nouns, all-caps
/// acronyms, hyphenated compounds). Multi-word terms only come in through the
/// explicit abbreviation-pair path — that's where the "Full Name (ACRO)"
/// rendering signals "this really is a named concept".
pub const DEFAULT_MAX_PHRASE_WORDS: usize = 1;
pub const MIN_PHRASE_LEN: usize = 2;
pub const MAX_PHRASE_LEN: usize = 64;

/// Generic English function words. Used as a last-resort "all words are
/// stopwords" reject, and as part of the leading/trailing checks.
pub const GENERIC_STOPWORDS: &[&str] = &[
    "a",
    "an",
    "the",
    "this",
    "that",
    "these",
    "those",
    "and",
    "or",
    "but",
    "nor",
    "yet",
    "so",
    "if",
    "then",
    "than",
    "though",
    "about",
    "above",
    "across",
    "after",
    "against",
    "along",
    "among",
    "around",
    "as",
    "at",
    "before",
    "behind",
    "below",
    "beneath",
    "beside",
    "between",
    "beyond",
    "by",
    "concerning",
    "despite",
    "down",
    "during",
    "except",
    "for",
    "from",
    "in",
    "inside",
    "into",
    "like",
    "near",
    "of",
    "off",
    "on",
    "onto",
    "out",
    "outside",
    "over",
    "past",
    "regarding",
    "since",
    "through",
    "throughout",
    "till",
    "to",
    "toward",
    "towards",
    "under",
    "underneath",
    "until",
    "up",
    "upon",
    "via",
    "with",
    "within",
    "without",
    "be",
    "is",
    "are",
    "was",
    "were",
    "been",
    "being",
    "do",
    "does",
    "did",
    "done",
    "doing",
    "have",
    "has",
    "had",
    "having",
    "can",
    "could",
    "may",
    "might",
    "must",
    "shall",
    "should",
    "will",
    "would",
    "let",
    "let's",
    "we",
    "us",
    "our",
    "ours",
    "they",
    "them",
    "their",
    "theirs",
    "he",
    "him",
    "his",
    "she",
    "her",
    "hers",
    "it",
    "its",
    "i",
    "me",
    "my",
    "mine",
    "you",
    "your",
    "yours",
    "who",
    "whom",
    "whose",
    "which",
    "what",
    "whatever",
    "whoever",
    "when",
    "where",
    "while",
    "why",
    "how",
    "all",
    "another",
    "any",
    "both",
    "each",
    "either",
    "every",
    "few",
    "many",
    "more",
    "most",
    "much",
    "neither",
    "no",
    "none",
    "other",
    "others",
    "several",
    "some",
    "such",
    "also",
    "again",
    "always",
    "ever",
    "even",
    "here",
    "however",
    "indeed",
    "just",
    "never",
    "not",
    "now",
    "only",
    "perhaps",
    "rather",
    "really",
    "still",
    "then",
    "there",
    "thus",
    "very",
    "well",
    "yet",
    "additionally",
    "consequently",
    "finally",
    "furthermore",
    "meanwhile",
    "moreover",
    "nevertheless",
    "nonetheless",
    "notably",
    "overall",
    "particularly",
    "respectively",
    "similarly",
    "specifically",
    "therefore",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "first",
    "second",
    "third",
    "next",
    "last",
    "previous",
    // overly generic academic filler — almost never a useful "term"
    "approach",
    "based",
    "data",
    "method",
    "methods",
    "model",
    "models",
    "paper",
    "papers",
    "result",
    "results",
    "show",
    "shows",
    "showed",
    "shown",
    "study",
    "studies",
    "use",
    "uses",
    "used",
    "using",
    "work",
    "works",
    "thing",
    "things",
    "case",
    "cases",
    "way",
    "ways",
    "form",
    "forms",
    "type",
    "types",
    "kind",
    "kinds",
    "lot",
    "lots",
    "part",
    "parts",
    "etc",
    "i.e",
    "e.g",
];

/// A 3+-word phrase with one of these as an interior word is almost always a
/// sentence fragment crossing a syntactic boundary. We deliberately keep `of`
/// out of this list — it's load-bearing in many real terms ("law of large
/// numbers", "rate of change", "principle of least action").
const MIDDLE_BANNED: &[&str] = &[
    "and",
    "or",
    "but",
    "nor",
    "with",
    "without",
    "from",
    "into",
    "onto",
    "upon",
    "to",
    "in",
    "on",
    "at",
    "by",
    "for",
    "as",
    "toward",
    "towards",
    "through",
    "throughout",
    "after",
    "before",
    "between",
    "against",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
];

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
        .filter(|w| w.chars().next().map_or(false, |c| c.is_uppercase()))
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
mod tests {
    use super::*;

    #[test]
    fn rejects_leading_stopword() {
        assert!(!is_term_candidate("with three independent"));
        assert!(!is_term_candidate("from a natural-language"));
        assert!(!is_term_candidate("the design process"));
    }

    #[test]
    fn rejects_trailing_stopword() {
        assert!(!is_term_candidate("MetaDesigner as a"));
        assert!(!is_term_candidate("invokes simulation and"));
        assert!(!is_term_candidate("route toward agentic"));
    }

    #[test]
    fn rejects_middle_conjunction() {
        assert!(!is_term_candidate("inspect and repair"));
    }

    #[test]
    fn keeps_proper_phrases() {
        assert!(is_term_candidate("self-correcting"));
        assert!(is_term_candidate("SSIM"));
        assert!(is_term_candidate("CNN"));
        assert!(is_term_candidate("Transformer"));
    }

    #[test]
    fn rejects_multi_word_phrases_by_default() {
        // Default mode is single-token. Multi-word terms only enter via
        // the abbreviation pair path (see `is_term_candidate_with`).
        assert!(!is_term_candidate("Agentic metasurface design"));
        assert!(!is_term_candidate("frequency mapping"));
    }

    #[test]
    fn allows_longer_full_forms_via_explicit_ceiling() {
        // Acronym full forms (e.g. "Structural Similarity Index Measure") can
        // run several words long; callers raise the ceiling for that path.
        assert!(is_term_candidate_with(
            "Structural Similarity Index Measure",
            5,
        ));
    }

    #[test]
    fn rejects_short_lowercase_singleton() {
        assert!(!is_term_candidate("data"));
        assert!(!is_term_candidate("model"));
    }

    #[test]
    fn rejects_sentence_connectors_even_when_title_case() {
        assert!(!is_term_candidate("Furthermore"));
        assert!(!is_term_candidate("Moreover"));
        assert!(!is_term_candidate("Therefore"));
        assert!(!is_term_candidate("Traditionally"));
    }

    #[test]
    fn acronym_bonus() {
        assert!(surface_quality_bonus("SSIM") > surface_quality_bonus("frequency mapping"));
    }
}
