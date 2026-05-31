use std::collections::{HashMap, HashSet};

use crate::ai::SubareaSpec;
use crate::ingest::PaperDraft;

use super::identity::{paper_key, upsert_by_id};
use super::relevance::finalize_bucket;
use super::{per_term_cap, pi_queries, year_filter_string, SearchResult};

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
    let r = finalize_bucket(&spec(), bucket, &HashSet::new(), 2);
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
