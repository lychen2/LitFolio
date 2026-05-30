//! Citation network fetching via Semantic Scholar API.

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::time::{SystemTime, UNIX_EPOCH};

const BASE: &str = "https://api.semanticscholar.org/graph/v1/paper";
const FIELDS: &str = "paperId,title,abstract,year,authors.name,venue,externalIds";
const CACHE_TTL_SECS: i64 = 7 * 24 * 3600;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CitationPaper {
    pub paper_id: String,
    pub title: String,
    pub authors: Vec<String>,
    pub year: Option<i32>,
    pub venue: Option<String>,
    pub abstract_snippet: Option<String>,
    pub doi: Option<String>,
    pub arxiv_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CitationGraph {
    pub paper_id: String,
    pub references: Vec<CitationPaper>,
    pub citations: Vec<CitationPaper>,
}

#[derive(Debug, Deserialize)]
struct S2PaperDetail {
    #[serde(default, rename = "references")]
    references: Option<Vec<S2CitationPaper>>,
    #[serde(default, rename = "citations")]
    citations: Option<Vec<S2CitationPaper>>,
}

#[derive(Debug, Deserialize)]
struct S2CitationPaper {
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

impl S2CitationPaper {
    fn into_citation_paper(self) -> CitationPaper {
        CitationPaper {
            paper_id: self.paper_id.unwrap_or_default(),
            title: self.title.unwrap_or_else(|| "(untitled)".into()),
            authors: self.authors.into_iter().filter_map(|a| a.name).collect(),
            year: self.year,
            venue: self.venue,
            abstract_snippet: self.abstract_text.as_ref().map(|a| {
                if a.len() > 200 {
                    format!("{}…", &a[..200])
                } else {
                    a.clone()
                }
            }),
            doi: self.external_ids.as_ref().and_then(|e| e.doi.clone()),
            arxiv_id: self.external_ids.as_ref().and_then(|e| e.arxiv.clone()),
        }
    }
}

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Fetch citation graph for a paper. Uses cache if available (7-day TTL).
pub async fn fetch_citations(
    pool: &SqlitePool,
    http: &reqwest::Client,
    paper_id: &str,
    doi: Option<&str>,
    arxiv_id: Option<&str>,
    title: &str,
) -> Result<CitationGraph> {
    // Check cache first.
    if let Some(cached) = get_cached(pool, paper_id).await? {
        return Ok(cached);
    }

    // Build the paper identifier for S2.
    let s2_id = if let Some(d) = doi {
        format!("DOI:{d}")
    } else if let Some(a) = arxiv_id {
        format!("ARXIV:{a}")
    } else {
        return Err(anyhow!(
            "Cannot fetch citations: no DOI or arXiv ID available for '{}'",
            title
        ));
    };

    let url = format!(
        "{BASE}/{}?fields=references.{FIELDS},citations.{FIELDS}",
        s2_id
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
            "Semantic Scholar citations returned {status}: {body}"
        ));
    }

    let detail: S2PaperDetail = resp.json().await.context("decode S2 citations JSON")?;

    let references: Vec<CitationPaper> = detail
        .references
        .unwrap_or_default()
        .into_iter()
        .map(S2CitationPaper::into_citation_paper)
        .collect();

    let citations: Vec<CitationPaper> = detail
        .citations
        .unwrap_or_default()
        .into_iter()
        .map(S2CitationPaper::into_citation_paper)
        .collect();

    let graph = CitationGraph {
        paper_id: paper_id.to_string(),
        references,
        citations,
    };

    // Cache the results.
    cache_results(pool, paper_id, &graph).await?;

    Ok(graph)
}

async fn get_cached(pool: &SqlitePool, paper_id: &str) -> Result<Option<CitationGraph>> {
    let rows = sqlx::query_as::<_, (String, String, Option<String>, Option<i32>, Option<String>, Option<String>, String)>(
        "SELECT cited_paper_id, cited_title, cited_authors, cited_year, cited_venue, cited_doi, direction FROM paper_citations WHERE paper_id = ?1 AND fetched_at > ?2"
    )
    .bind(paper_id)
    .bind(now_secs() - CACHE_TTL_SECS)
    .fetch_all(pool)
    .await?;

    if rows.is_empty() {
        return Ok(None);
    }

    let mut references = Vec::new();
    let mut citations = Vec::new();

    for (
        cited_paper_id,
        cited_title,
        cited_authors,
        cited_year,
        cited_venue,
        cited_doi,
        direction,
    ) in rows
    {
        let authors: Vec<String> = cited_authors
            .as_ref()
            .and_then(|a| serde_json::from_str(a).ok())
            .unwrap_or_default();
        let paper = CitationPaper {
            paper_id: cited_paper_id,
            title: cited_title,
            authors,
            year: cited_year,
            venue: cited_venue,
            abstract_snippet: None,
            doi: cited_doi,
            arxiv_id: None,
        };
        if direction == "references" {
            references.push(paper);
        } else {
            citations.push(paper);
        }
    }

    Ok(Some(CitationGraph {
        paper_id: paper_id.to_string(),
        references,
        citations,
    }))
}

async fn cache_results(pool: &SqlitePool, paper_id: &str, graph: &CitationGraph) -> Result<()> {
    let now = now_secs();

    // Clear old cache for this paper.
    sqlx::query("DELETE FROM paper_citations WHERE paper_id = ?1")
        .bind(paper_id)
        .execute(pool)
        .await?;

    // Insert references.
    for p in &graph.references {
        let authors_json = serde_json::to_string(&p.authors).unwrap_or_else(|_| "[]".into());
        sqlx::query(
            "INSERT OR IGNORE INTO paper_citations (paper_id, cited_paper_id, cited_title, cited_authors, cited_year, cited_venue, cited_doi, direction, fetched_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'references', ?8)"
        )
        .bind(paper_id)
        .bind(&p.paper_id)
        .bind(&p.title)
        .bind(&authors_json)
        .bind(p.year)
        .bind(&p.venue)
        .bind(&p.doi)
        .bind(now)
        .execute(pool)
        .await?;
    }

    // Insert citations.
    for p in &graph.citations {
        let authors_json = serde_json::to_string(&p.authors).unwrap_or_else(|_| "[]".into());
        sqlx::query(
            "INSERT OR IGNORE INTO paper_citations (paper_id, cited_paper_id, cited_title, cited_authors, cited_year, cited_venue, cited_doi, direction, fetched_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'citations', ?8)"
        )
        .bind(paper_id)
        .bind(&p.paper_id)
        .bind(&p.title)
        .bind(&authors_json)
        .bind(p.year)
        .bind(&p.venue)
        .bind(&p.doi)
        .bind(now)
        .execute(pool)
        .await?;
    }

    Ok(())
}
