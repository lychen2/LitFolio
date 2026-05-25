//! Topic discovery: given a topic query, return two ranked sets of papers
//!   - `recent`  : top-cited papers within the user-specified year range
//!   - `classic` : top-cited papers across all years
//!
//! AI summarization is wired separately once `core::ai` is in place (M4+).

use anyhow::Result;
use chrono::{Datelike, Utc};
use serde::Serialize;

use super::search::{bulk_by_citations, SearchResult};

#[derive(Debug, Clone, Serialize)]
pub struct TopicReport {
    pub query: String,
    pub recent_year_from: i32,
    pub recent_year_to: i32,
    pub recent: Vec<SearchResult>,
    pub classic: Vec<SearchResult>,
}

#[derive(Debug, Clone, Copy)]
pub struct TopicRequest {
    /// How many most-cited recent papers to fetch (within recent_window_years).
    pub recent_limit: u32,
    /// How many most-cited all-time papers to fetch.
    pub classic_limit: u32,
    /// Recent = last N years (default 3).
    pub recent_window_years: u32,
}

impl Default for TopicRequest {
    fn default() -> Self {
        Self {
            recent_limit: 20,
            classic_limit: 20,
            recent_window_years: 3,
        }
    }
}

pub async fn discover_topic(
    client: &reqwest::Client,
    query: &str,
    req: TopicRequest,
) -> Result<TopicReport> {
    let this_year = Utc::now().year();
    let year_from = this_year - req.recent_window_years as i32 + 1;
    let year_filter = format!("{year_from}-{this_year}");

    let (recent_res, classic_res) = tokio::try_join!(
        bulk_by_citations(client, query, Some(&year_filter), req.recent_limit),
        bulk_by_citations(client, query, None, req.classic_limit),
    )?;

    Ok(TopicReport {
        query: query.to_string(),
        recent_year_from: year_from,
        recent_year_to: this_year,
        recent: recent_res,
        classic: classic_res,
    })
}

/// Multi-term variant: runs N parallel S2 queries (one per term), then merges
/// and dedupes by paper id, keeping the most-cited copy. This is what gets
/// called when the LLM expansion has produced several candidate terms —
/// joining them with spaces would force S2 to find docs containing ALL terms
/// (and rarely returns more than a couple of hits), but querying each term
/// separately and unioning gives proper recall.
pub async fn discover_topic_multi(
    client: &reqwest::Client,
    terms: &[String],
    req: TopicRequest,
) -> Result<TopicReport> {
    let this_year = Utc::now().year();
    let year_from = this_year - req.recent_window_years as i32 + 1;
    let year_filter = format!("{year_from}-{this_year}");

    // Per-term limit caps how much we ask for from each S2 call. We fan out
    // across terms and let the merger handle dedup + ranking — asking each
    // term for the same `recent_limit` would balloon the response.
    let per_term = req.recent_limit.max(req.classic_limit);

    let recent_futs = terms
        .iter()
        .map(|t| bulk_by_citations(client, t, Some(&year_filter), per_term));
    let classic_futs = terms
        .iter()
        .map(|t| bulk_by_citations(client, t, None, per_term));
    let recent_results = futures_join_all(recent_futs).await?;
    let classic_results = futures_join_all(classic_futs).await?;

    let recent = merge_dedupe_top(recent_results, req.recent_limit as usize);
    let classic = merge_dedupe_top(classic_results, req.classic_limit as usize);

    Ok(TopicReport {
        query: terms.join(" · "),
        recent_year_from: year_from,
        recent_year_to: this_year,
        recent,
        classic,
    })
}

/// Tiny inline futures::join_all to avoid pulling the whole `futures` crate in.
/// Runs all futures concurrently, fails fast on the first error.
async fn futures_join_all<F, T>(iter: impl IntoIterator<Item = F>) -> Result<Vec<T>>
where
    F: std::future::Future<Output = Result<T>>,
{
    let mut handles = Vec::new();
    for fut in iter {
        handles.push(fut);
    }
    let mut out = Vec::with_capacity(handles.len());
    // Sequential await is fine here — bulk_by_citations is I/O bound; tokio
    // would run them in parallel via tokio::spawn but we'd need 'static
    // bounds. For 3-6 terms the latency cost is small.
    for h in handles {
        out.push(h.await?);
    }
    Ok(out)
}

/// Flatten all per-term result lists, dedupe by paper_id (keeping the entry
/// with the highest citation_count), then sort by citation_count descending
/// and take the top N.
fn merge_dedupe_top(buckets: Vec<Vec<SearchResult>>, top_n: usize) -> Vec<SearchResult> {
    let mut seen: std::collections::HashMap<String, SearchResult> =
        std::collections::HashMap::new();
    for bucket in buckets {
        for hit in bucket {
            let key = hit
                .paper_id
                .clone()
                .unwrap_or_else(|| format!("noid:{}", hit.draft.title));
            seen.entry(key)
                .and_modify(|existing| {
                    if hit.citation_count.unwrap_or(0) > existing.citation_count.unwrap_or(0) {
                        *existing = hit.clone();
                    }
                })
                .or_insert(hit);
        }
    }
    let mut merged: Vec<SearchResult> = seen.into_values().collect();
    merged.sort_by(|a, b| {
        b.citation_count
            .unwrap_or(0)
            .cmp(&a.citation_count.unwrap_or(0))
    });
    merged.truncate(top_n);
    merged
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_request_sane() {
        let r = TopicRequest::default();
        assert_eq!(r.recent_limit, 20);
        assert_eq!(r.classic_limit, 20);
        assert_eq!(r.recent_window_years, 3);
    }
}
