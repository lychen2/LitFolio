//! Semantic Scholar Graph API: search + bulk topic discovery.
//!
//! Endpoints used:
//! - `/paper/search`        (UI search box, max 30 hits)
//! - `/paper/search/bulk`   (topic discovery, sorts by citationCount, up to 1000)
//!
//! Rate limit (unauthenticated): 100 requests per 5 minutes per IP. We bucket
//! at 80 to leave headroom.

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use super::paper_draft::PaperDraft;

const BASE: &str = "https://api.semanticscholar.org/graph/v1/paper";
const FIELDS: &str = "paperId,title,abstract,year,authors.name,venue,externalIds,citationCount,influentialCitationCount";

const BUCKET_CAP: u64 = 80;
const BUCKET_WINDOW_SECS: u64 = 300;

static LAST_BUCKET_RESET: AtomicU64 = AtomicU64::new(0);
static REQUESTS_IN_WINDOW: AtomicU64 = AtomicU64::new(0);

fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn check_rate_limit() -> Result<()> {
    let now = now_secs();
    let last = LAST_BUCKET_RESET.load(Ordering::Relaxed);
    if now.saturating_sub(last) >= BUCKET_WINDOW_SECS {
        LAST_BUCKET_RESET.store(now, Ordering::Relaxed);
        REQUESTS_IN_WINDOW.store(0, Ordering::Relaxed);
    }
    let used = REQUESTS_IN_WINDOW.fetch_add(1, Ordering::Relaxed);
    if used >= BUCKET_CAP {
        REQUESTS_IN_WINDOW.fetch_sub(1, Ordering::Relaxed);
        return Err(anyhow!(
            "Semantic Scholar rate limit reached ({BUCKET_CAP} per 5 min); try again later"
        ));
    }
    Ok(())
}

#[derive(Debug, Deserialize)]
struct SearchResponse {
    #[serde(default)]
    total: u64,
    #[serde(default)]
    data: Vec<SearchHit>,
}

#[derive(Debug, Deserialize)]
struct SearchHit {
    #[serde(default, rename = "paperId")]
    paper_id: Option<String>,
    #[serde(default)]
    title: Option<String>,
    #[serde(default, rename = "abstract")]
    abstract_text: Option<String>,
    #[serde(default)]
    year: Option<i32>,
    #[serde(default)]
    venue: Option<String>,
    #[serde(default)]
    authors: Vec<HitAuthor>,
    #[serde(default, rename = "externalIds")]
    external_ids: Option<ExternalIds>,
    #[serde(default, rename = "citationCount")]
    citation_count: Option<u32>,
    #[serde(default, rename = "influentialCitationCount")]
    influential_citation_count: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct HitAuthor { name: Option<String> }

#[derive(Debug, Deserialize)]
struct ExternalIds {
    #[serde(rename = "DOI")] doi: Option<String>,
    #[serde(rename = "ArXiv")] arxiv: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub paper_id: Option<String>,
    pub citation_count: Option<u32>,
    pub influential_citation_count: Option<u32>,
    pub draft: PaperDraft,
}

impl SearchHit {
    fn into_result(self) -> SearchResult {
        SearchResult {
            paper_id: self.paper_id,
            citation_count: self.citation_count,
            influential_citation_count: self.influential_citation_count,
            draft: PaperDraft {
                title: self.title.unwrap_or_else(|| "(untitled)".into()),
                authors: self.authors.into_iter().filter_map(|a| a.name).collect(),
                year: self.year,
                venue: self.venue,
                doi: self.external_ids.as_ref().and_then(|e| e.doi.clone()),
                arxiv_id: self.external_ids.and_then(|e| e.arxiv),
                abstract_text: self.abstract_text,
            },
        }
    }
}

pub async fn search_semantic_scholar(
    client: &reqwest::Client,
    query: &str,
    limit: u32,
) -> Result<Vec<SearchResult>> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }
    check_rate_limit()?;
    let limit = limit.clamp(1, 30);
    let url = format!("{BASE}/search?query={}&limit={limit}&fields={FIELDS}", urlencode(query));
    let resp = client.get(&url).send().await.with_context(|| format!("GET {url}"))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(anyhow!("Semantic Scholar returned {status}: {body}"));
    }
    let body: SearchResponse = resp.json().await.context("decode S2 JSON")?;
    Ok(body.data.into_iter().map(SearchHit::into_result).collect())
}

/// Bulk fetch sorted by citation count. `year_filter` is an optional range
/// string accepted by S2, e.g. "2023-2026" or "2023-".
pub async fn bulk_by_citations(
    client: &reqwest::Client,
    query: &str,
    year_filter: Option<&str>,
    limit: u32,
) -> Result<Vec<SearchResult>> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }
    check_rate_limit()?;
    let limit = limit.clamp(1, 1000);
    let mut url = format!(
        "{BASE}/search/bulk?query={}&sort=citationCount:desc&fields={FIELDS}&limit={limit}",
        urlencode(query),
    );
    if let Some(y) = year_filter {
        url.push_str(&format!("&year={}", urlencode(y)));
    }
    let resp = client.get(&url).send().await.with_context(|| format!("GET {url}"))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(anyhow!("Semantic Scholar bulk returned {status}: {body}"));
    }
    let body: SearchResponse = resp.json().await.context("decode S2 bulk JSON")?;
    let mut out: Vec<SearchResult> = body.data.into_iter().map(SearchHit::into_result).collect();
    // The bulk endpoint sorts by citation count server-side but lets enforce explicitly.
    out.sort_by(|a, b| b.citation_count.unwrap_or(0).cmp(&a.citation_count.unwrap_or(0)));
    Ok(out)
}

fn urlencode(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '-' | '_' | '.' | '~' => c.to_string(),
            ' ' => "+".to_string(),
            _ => format!("%{:02X}", c as u32),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn urlencode_basic() {
        assert_eq!(urlencode("attention is all"), "attention+is+all");
        assert_eq!(urlencode("a&b"), "a%26b");
    }

    #[test]
    fn rate_limit_caps_at_bucket() {
        LAST_BUCKET_RESET.store(now_secs(), Ordering::Relaxed);
        REQUESTS_IN_WINDOW.store(0, Ordering::Relaxed);
        for _ in 0..BUCKET_CAP { check_rate_limit().unwrap(); }
        assert!(check_rate_limit().is_err());
    }
}
