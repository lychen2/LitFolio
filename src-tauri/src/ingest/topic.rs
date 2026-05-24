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
        Self { recent_limit: 20, classic_limit: 20, recent_window_years: 3 }
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

    // Bulk endpoint is heavier — request the larger of the two limits in one go
    // for "classic" then filter for "recent" client-side as a fallback if the
    // server side year filter fails. Doing two independent calls keeps the two
    // sets cleanly comparable.
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
