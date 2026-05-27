//! Similar paper recommendations via Semantic Scholar Recommendations API.

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::time::{SystemTime, UNIX_EPOCH};

const BASE: &str = "https://api.semanticscholar.org/recommendations/v1/papers";
const FIELDS: &str = "paperId,title,abstract,year,authors.name,venue,externalIds,citationCount";

/// How long cached results are considered fresh (7 days).
const CACHE_TTL_SECS: i64 = 7 * 24 * 3600;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Recommendation {
    pub paper_id: String,
    pub title: String,
    pub authors: Vec<String>,
    pub year: Option<i32>,
    pub venue: Option<String>,
    pub abstract_snippet: Option<String>,
    pub doi: Option<String>,
    pub arxiv_id: Option<String>,
    pub citation_count: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct S2Response {
    #[serde(default, rename = "recommendedPapers")]
    recommended_papers: Vec<S2Paper>,
}

#[derive(Debug, Deserialize)]
struct S2Paper {
    #[serde(default, rename = "paperId")]
    paper_id: Option<String>,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    abstract_text: Option<String>,
    #[serde(default)]
    year: Option<i32>,
    #[serde(default)]
    venue: Option<String>,
    #[serde(default)]
    authors: Vec<S2Author>,
    #[serde(default, rename = "externalIds")]
    external_ids: Option<S2ExternalIds>,
    #[serde(default, rename = "citationCount")]
    citation_count: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct S2Author {
    #[serde(default)]
    name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct S2ExternalIds {
    #[serde(default, rename = "DOI")]
    doi: Option<String>,
    #[serde(default, rename = "ArXiv")]
    arxiv: Option<String>,
}

impl S2Paper {
    fn into_recommendation(self) -> Recommendation {
        Recommendation {
            paper_id: self.paper_id.unwrap_or_default(),
            title: self.title.unwrap_or_else(|| "(untitled)".into()),
            authors: self.authors.into_iter().filter_map(|a| a.name).collect(),
            year: self.year,
            venue: self.venue,
            abstract_snippet: self.abstract_text.as_ref().map(|a| {
                if a.len() > 300 {
                    format!("{}…", &a[..300])
                } else {
                    a.clone()
                }
            }),
            doi: self.external_ids.as_ref().and_then(|e| e.doi.clone()),
            arxiv_id: self.external_ids.as_ref().and_then(|e| e.arxiv.clone()),
            citation_count: self.citation_count,
        }
    }
}

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Find similar papers using Semantic Scholar Recommendations API.
/// Uses DOI or arXiv ID as seed; falls back to title-based lookup.
/// Results are cached for 7 days.
pub async fn find_similar(
    pool: &SqlitePool,
    http: &reqwest::Client,
    paper_id: &str,
    doi: Option<&str>,
    arxiv_id: Option<&str>,
    title: &str,
) -> Result<Vec<Recommendation>> {
    // Check cache first.
    if let Some(cached) = get_cached(pool, paper_id).await? {
        return Ok(cached);
    }

    // Build the seed paper identifier for S2.
    let seed = if let Some(d) = doi {
        format!("DOI:{d}")
    } else if let Some(a) = arxiv_id {
        format!("ARXIV:{a}")
    } else {
        return Err(anyhow!(
            "Cannot find similar papers: no DOI or arXiv ID available for '{}'",
            title
        ));
    };

    let url = format!(
        "{BASE}/{seed}?fields={FIELDS}&limit=20",
    );

    let resp = http
        .get(&url)
        .send()
        .await
        .with_context(|| format!("GET {url}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(anyhow!(
            "Semantic Scholar recommendations returned {status}: {body}"
        ));
    }

    let body: S2Response = resp.json().await.context("decode S2 recommendations JSON")?;
    let recs: Vec<Recommendation> = body
        .recommended_papers
        .into_iter()
        .map(S2Paper::into_recommendation)
        .collect();

    // Filter out papers already in the library.
    let existing_dois = existing_dois(pool).await?;
    let existing_arxiv = existing_arxiv_ids(pool).await?;
    let filtered: Vec<Recommendation> = recs
        .into_iter()
        .filter(|r| {
            if let Some(ref d) = r.doi {
                if existing_dois.contains(&d.to_lowercase()) {
                    return false;
                }
            }
            if let Some(ref a) = r.arxiv_id {
                if existing_arxiv.contains(&a.to_lowercase()) {
                    return false;
                }
            }
            true
        })
        .collect();

    // Cache the results.
    cache_results(pool, paper_id, &filtered).await?;

    Ok(filtered)
}

async fn get_cached(
    pool: &SqlitePool,
    paper_id: &str,
) -> Result<Option<Vec<Recommendation>>> {
    let row = sqlx::query_scalar::<_, String>(
        "SELECT results_json FROM recommendation_cache WHERE paper_id = ?1 AND fetched_at > ?2",
    )
    .bind(paper_id)
    .bind(now_secs() - CACHE_TTL_SECS)
    .fetch_optional(pool)
    .await?;

    match row {
        Some(json) => {
            let recs: Vec<Recommendation> =
                serde_json::from_str(&json).context("decode cached recommendations")?;
            Ok(Some(recs))
        }
        None => Ok(None),
    }
}

async fn cache_results(
    pool: &SqlitePool,
    paper_id: &str,
    recs: &[Recommendation],
) -> Result<()> {
    let json = serde_json::to_string(recs)?;
    sqlx::query(
        "INSERT OR REPLACE INTO recommendation_cache (paper_id, results_json, fetched_at) VALUES (?1, ?2, ?3)",
    )
    .bind(paper_id)
    .bind(&json)
    .bind(now_secs())
    .execute(pool)
    .await?;
    Ok(())
}

async fn existing_dois(pool: &SqlitePool) -> Result<std::collections::HashSet<String>> {
    let rows = sqlx::query_scalar::<_, String>(
        "SELECT LOWER(doi) FROM papers WHERE doi IS NOT NULL AND doi != ''",
    )
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().collect())
}

async fn existing_arxiv_ids(pool: &SqlitePool) -> Result<std::collections::HashSet<String>> {
    let rows = sqlx::query_scalar::<_, String>(
        "SELECT LOWER(arxiv_id) FROM papers WHERE arxiv_id IS NOT NULL AND arxiv_id != ''",
    )
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn s2_paper_into_recommendation() {
        let p = S2Paper {
            paper_id: Some("abc123".into()),
            title: Some("Test Paper".into()),
            abstract_text: Some("A".repeat(500)),
            year: Some(2024),
            venue: Some("ICML".into()),
            authors: vec![
                S2Author { name: Some("Alice".into()) },
                S2Author { name: None },
                S2Author { name: Some("Bob".into()) },
            ],
            external_ids: Some(S2ExternalIds {
                doi: Some("10.1234/test".into()),
                arxiv: Some("2401.00001".into()),
            }),
            citation_count: Some(42),
        };
        let r = p.into_recommendation();
        assert_eq!(r.paper_id, "abc123");
        assert_eq!(r.title, "Test Paper");
        assert_eq!(r.authors, vec!["Alice", "Bob"]);
        assert_eq!(r.year, Some(2024));
        assert!(r.abstract_snippet.as_ref().unwrap().ends_with('…'));
        assert_eq!(r.doi.as_deref(), Some("10.1234/test"));
        assert_eq!(r.citation_count, Some(42));
    }
}
