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
    assert!(!is_term_candidate("Agentic metasurface design"));
    assert!(!is_term_candidate("frequency mapping"));
}

#[test]
fn allows_longer_full_forms_via_explicit_ceiling() {
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
