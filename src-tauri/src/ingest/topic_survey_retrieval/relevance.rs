use std::collections::{HashMap, HashSet};

use crate::ai::SubareaSpec;
use crate::ingest::SearchResult;

use super::identity::{already_seen, has_doi};

const MIN_TOKEN_LEN: usize = 3;
const MIN_MATCHED_TOKENS: usize = 2;

pub(super) fn finalize_bucket(
    spec: &SubareaSpec,
    bucket: HashMap<String, SearchResult>,
    cross_subarea_seen: &HashSet<String>,
    top_k: usize,
) -> Vec<SearchResult> {
    let tokens = relevance_tokens(spec);
    let mut merged: Vec<SearchResult> = bucket
        .into_values()
        .filter(has_doi)
        .filter(|h| is_relevant(h, &tokens, &spec.search_terms))
        .filter(|h| !already_seen(h, cross_subarea_seen))
        .collect();
    merged.sort_by(|a, b| {
        b.citation_count
            .unwrap_or(0)
            .cmp(&a.citation_count.unwrap_or(0))
    });
    merged.truncate(top_k);
    merged
}

fn is_relevant(h: &SearchResult, tokens: &[String], phrases: &[String]) -> bool {
    let text = paper_text(h);
    if phrases
        .iter()
        .any(|phrase| text.contains(&phrase.to_lowercase()))
    {
        return true;
    }
    let matched = tokens
        .iter()
        .filter(|token| text.contains(token.as_str()))
        .count();
    matched >= MIN_MATCHED_TOKENS
}

fn paper_text(h: &SearchResult) -> String {
    format!(
        "{}\n{}",
        h.draft.title.to_lowercase(),
        h.draft
            .abstract_text
            .clone()
            .unwrap_or_default()
            .to_lowercase()
    )
}

fn relevance_tokens(spec: &SubareaSpec) -> Vec<String> {
    let raw = std::iter::once(spec.name.as_str())
        .chain(spec.search_terms.iter().map(String::as_str))
        .collect::<Vec<_>>()
        .join(" ");
    let mut seen = HashSet::new();
    raw.split(|c: char| !c.is_ascii_alphanumeric())
        .map(str::to_lowercase)
        .filter(|s| s.len() >= MIN_TOKEN_LEN && !is_stopword(s))
        .filter(|s| seen.insert(s.clone()))
        .collect()
}

fn is_stopword(token: &str) -> bool {
    matches!(
        token,
        "and" | "the" | "for" | "with" | "from" | "into" | "using" | "based"
    )
}
