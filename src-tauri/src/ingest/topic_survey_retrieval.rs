//! Topic Survey Phase 2 — ground the LLM skeleton in real Semantic Scholar papers.
//!
//! For each subarea in the skeleton, fan out:
//!   - `bulk_by_citations(search_term, year_filter=subarea.year_range)` for each search_term
//!   - `search_semantic_scholar(pi_name + search_term)` for PI hints, never PI alone
//! then dedupe by paper_id, filter for DOI + title/abstract relevance, rank by citation_count, take top K.
//!
//! Cross-subarea: first-wins. A paper appearing in multiple subareas stays with
//! the FIRST one (subareas processed in skeleton order). Avoids the same paper
//! showing up under three different subareas.

use anyhow::Result;
use serde::Serialize;
use std::collections::{HashMap, HashSet};

use super::search::{bulk_by_citations, search_semantic_scholar, SearchResult};
use crate::ai::{SubareaSpec, SurveySkeleton};

const MIN_TOKEN_LEN: usize = 3;
const MIN_MATCHED_TOKENS: usize = 2;
const PI_TERM_LIMIT: usize = 2;

#[derive(Debug, Clone, Serialize)]
pub struct GroundedSubarea {
    pub spec: SubareaSpec,
    pub papers: Vec<SearchResult>,
}

/// How many raw hits to ask for from each per-term S2 call. Multiplied vs
/// `per_subarea_topk` so that after dedupe + cross-subarea pruning we still
/// have enough candidates to fill the top-K slots.
fn per_term_cap(per_subarea_topk: usize) -> u32 {
    (per_subarea_topk.saturating_mul(3).max(15)) as u32
}

pub async fn ground_survey(
    client: &reqwest::Client,
    skeleton: &SurveySkeleton,
    per_subarea_topk: usize,
) -> Result<Vec<GroundedSubarea>> {
    let mut seen: HashSet<String> = HashSet::new();
    let mut out: Vec<GroundedSubarea> = Vec::with_capacity(skeleton.subareas.len());
    let term_cap = per_term_cap(per_subarea_topk);

    for spec in &skeleton.subareas {
        let mut bucket: HashMap<String, SearchResult> = HashMap::new();
        let year_filter = year_filter_string(spec.year_range);

        for term in &spec.search_terms {
            // Per-term S2 errors are non-fatal: one term failing shouldn't drop the whole
            // subarea. We log via warning channel implicitly by just skipping the bucket
            // for that term. Empty buckets fall through to the next phase silently.
            let hits = bulk_by_citations(client, term, year_filter.as_deref(), term_cap)
                .await
                .unwrap_or_default();
            for hit in hits {
                upsert_by_id(&mut bucket, hit);
            }
        }

        for pi_query in pi_queries(spec) {
            let hits = search_semantic_scholar(client, &pi_query, 20)
                .await
                .unwrap_or_default();
            for hit in hits {
                upsert_by_id(&mut bucket, hit);
            }
        }

        let papers = finalize_bucket(spec, bucket, &seen, per_subarea_topk);
        for h in &papers {
            if let Some(id) = paper_key(h) {
                seen.insert(id);
            }
        }
        out.push(GroundedSubarea {
            spec: spec.clone(),
            papers,
        });
    }

    Ok(out)
}

fn upsert_by_id(bucket: &mut HashMap<String, SearchResult>, hit: SearchResult) {
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

fn finalize_bucket(
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

fn pi_queries(spec: &SubareaSpec) -> Vec<String> {
    spec.pi_hints
        .iter()
        .flat_map(|pi| {
            spec.search_terms
                .iter()
                .take(PI_TERM_LIMIT)
                .map(move |term| format!("{pi} {term}"))
        })
        .collect()
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

fn has_doi(h: &SearchResult) -> bool {
    h.draft
        .doi
        .as_deref()
        .map(str::trim)
        .map(|s| !s.is_empty())
        .unwrap_or(false)
}

fn already_seen(h: &SearchResult, seen: &HashSet<String>) -> bool {
    paper_key(h).map(|k| seen.contains(&k)).unwrap_or(false)
}

/// Stable identity for cross-subarea dedupe. S2's paperId is the gold key when
/// present; DOI is a fallback for the rare result that lacks paperId. Hits
/// with neither identifier can't be deduplicated and are dropped from buckets.
fn paper_key(h: &SearchResult) -> Option<String> {
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

fn year_filter_string(range: Option<(i32, i32)>) -> Option<String> {
    range.map(|(s, e)| format!("{s}-{e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ingest::PaperDraft;

    fn fake(paper_id: &str, cites: u32) -> SearchResult {
        SearchResult {
            paper_id: Some(paper_id.into()),
            citation_count: Some(cites),
            influential_citation_count: None,
            draft: PaperDraft {
                title: format!("chirped pulse amplification paper {paper_id}"),
                authors: vec![],
                year: None,
                venue: None,
                doi: Some(format!("10.1234/{paper_id}")),
                arxiv_id: None,
                abstract_text: Some("few-cycle pulse compression".into()),
            },
        }
    }

    fn spec() -> SubareaSpec {
        SubareaSpec {
            name: "Chirped Pulse Amplification".into(),
            year_range: None,
            summary: "x".into(),
            search_terms: vec!["chirped pulse amplification".into()],
            pi_hints: vec!["Donna Strickland".into()],
        }
    }

    #[test]
    fn upsert_keeps_higher_citation_when_duplicate_id() {
        let mut bucket = HashMap::new();
        upsert_by_id(&mut bucket, fake("p1", 10));
        upsert_by_id(&mut bucket, fake("p1", 50));
        upsert_by_id(&mut bucket, fake("p1", 30));
        assert_eq!(bucket.len(), 1);
        assert_eq!(bucket.get("p1").unwrap().citation_count, Some(50));
    }

    #[test]
    fn upsert_skips_results_without_id_or_doi() {
        let mut bucket = HashMap::new();
        let mut r = fake("ignored", 5);
        r.paper_id = None;
        r.draft.doi = None;
        upsert_by_id(&mut bucket, r);
        assert!(bucket.is_empty());
    }

    #[test]
    fn upsert_uses_doi_when_no_paper_id() {
        let mut bucket = HashMap::new();
        let mut r = fake("ignored", 5);
        r.paper_id = None;
        r.draft.doi = Some("10.1234/abc".into());
        upsert_by_id(&mut bucket, r);
        assert!(bucket.contains_key("doi:10.1234/abc"));
    }

    #[test]
    fn paper_key_prefers_paper_id_over_doi() {
        let mut r = fake("s2id", 1);
        r.draft.doi = Some("10.999/x".into());
        assert_eq!(paper_key(&r), Some("s2id".to_string()));
    }

    #[test]
    fn year_filter_string_formats_inclusive_range() {
        assert_eq!(
            year_filter_string(Some((2000, 2010))).as_deref(),
            Some("2000-2010")
        );
        assert_eq!(year_filter_string(None), None);
    }

    #[test]
    fn finalize_bucket_sorts_desc_and_truncates() {
        let mut bucket = HashMap::new();
        upsert_by_id(&mut bucket, fake("p1", 50));
        upsert_by_id(&mut bucket, fake("p2", 200));
        upsert_by_id(&mut bucket, fake("p3", 10));
        upsert_by_id(&mut bucket, fake("p4", 100));
        let seen = HashSet::new();
        let r = finalize_bucket(&spec(), bucket, &seen, 2);
        assert_eq!(r.len(), 2);
        assert_eq!(r[0].paper_id.as_deref(), Some("p2"));
        assert_eq!(r[1].paper_id.as_deref(), Some("p4"));
    }

    #[test]
    fn finalize_bucket_drops_papers_already_claimed_by_earlier_subarea() {
        let mut bucket = HashMap::new();
        upsert_by_id(&mut bucket, fake("p1", 100));
        upsert_by_id(&mut bucket, fake("p2", 50));
        upsert_by_id(&mut bucket, fake("p3", 30));
        let mut seen = HashSet::new();
        seen.insert("p1".to_string());
        let r = finalize_bucket(&spec(), bucket, &seen, 10);
        assert_eq!(r.len(), 2);
        assert_eq!(r[0].paper_id.as_deref(), Some("p2"));
        assert_eq!(r[1].paper_id.as_deref(), Some("p3"));
    }

    #[test]
    fn finalize_bucket_drops_papers_without_doi() {
        let mut bucket = HashMap::new();
        let mut no_doi = fake("p1", 100);
        no_doi.draft.doi = None;
        let mut with_doi = fake("p2", 50);
        with_doi.draft.doi = Some("10.1234/ok".into());
        upsert_by_id(&mut bucket, no_doi);
        upsert_by_id(&mut bucket, with_doi);
        let r = finalize_bucket(&spec(), bucket, &HashSet::new(), 10);
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].paper_id.as_deref(), Some("p2"));
    }

    #[test]
    fn finalize_bucket_drops_lexically_irrelevant_papers() {
        let mut bucket = HashMap::new();
        let mut irrelevant = fake("p1", 100);
        irrelevant.draft.title = "graph neural networks for molecules".into();
        irrelevant.draft.abstract_text = Some("message passing on molecular graphs".into());
        upsert_by_id(&mut bucket, irrelevant);
        upsert_by_id(&mut bucket, fake("p2", 50));
        let r = finalize_bucket(&spec(), bucket, &HashSet::new(), 10);
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].paper_id.as_deref(), Some("p2"));
    }

    #[test]
    fn pi_queries_combine_pi_with_search_terms() {
        let queries = pi_queries(&spec());
        assert_eq!(
            queries,
            vec!["Donna Strickland chirped pulse amplification"]
        );
    }

    #[test]
    fn per_term_cap_scales_with_topk_with_floor() {
        assert_eq!(per_term_cap(6), 18);
        assert_eq!(per_term_cap(2), 15); // floor
        assert_eq!(per_term_cap(10), 30);
    }
}
