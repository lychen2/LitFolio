//! Topic Survey Phase 2 — ground the LLM skeleton in real Semantic Scholar papers.
//!
//! For each subarea in the skeleton, fan out:
//!   - `bulk_by_citations(search_term, year_filter=subarea.year_range)` for each search_term
//!   - `search_semantic_scholar(pi_name + search_term)` for PI hints, never PI alone
//!     then dedupe by paper_id, filter for DOI + title/abstract relevance, rank by citation_count, take top K.
//!
//! Cross-subarea: first-wins. A paper appearing in multiple subareas stays with
//! the FIRST one (subareas processed in skeleton order). Avoids the same paper
//! showing up under three different subareas.

use anyhow::Result;
use serde::Serialize;
use std::collections::{HashMap, HashSet};

use super::search::{bulk_by_citations, search_semantic_scholar, SearchResult};
use crate::ai::{SubareaSpec, SurveySkeleton};

mod identity;
mod relevance;

#[cfg(test)]
mod tests;

use identity::{paper_key, upsert_by_id};
use relevance::finalize_bucket;

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

fn year_filter_string(range: Option<(i32, i32)>) -> Option<String> {
    range.map(|(s, e)| format!("{s}-{e}"))
}
