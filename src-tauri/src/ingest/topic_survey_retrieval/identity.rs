use std::collections::{HashMap, HashSet};

use crate::ingest::SearchResult;

pub(super) fn upsert_by_id(bucket: &mut HashMap<String, SearchResult>, hit: SearchResult) {
    let key = match paper_key(&hit) {
        Some(k) => k,
        None => return, // skip hits with no usable identity
    };
    bucket
        .entry(key)
        .and_modify(|existing| {
            if hit.citation_count.unwrap_or(0) > existing.citation_count.unwrap_or(0) {
                *existing = hit.clone();
            }
        })
        .or_insert(hit);
}

pub(super) fn has_doi(h: &SearchResult) -> bool {
    h.draft
        .doi
        .as_deref()
        .map(str::trim)
        .map(|s| !s.is_empty())
        .unwrap_or(false)
}

pub(super) fn already_seen(h: &SearchResult, seen: &HashSet<String>) -> bool {
    paper_key(h).map(|k| seen.contains(&k)).unwrap_or(false)
}

/// Stable identity for cross-subarea dedupe. S2's paperId is the gold key when
/// present; DOI is a fallback for the rare result that lacks paperId. Hits
/// with neither identifier can't be deduplicated and are dropped from buckets.
pub(super) fn paper_key(h: &SearchResult) -> Option<String> {
    if let Some(id) = &h.paper_id {
        if !id.is_empty() {
            return Some(id.clone());
        }
    }
    if let Some(doi) = &h.draft.doi {
        if !doi.is_empty() {
            return Some(format!("doi:{doi}"));
        }
    }
    None
}
