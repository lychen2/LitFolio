//! Candidate Inbox: papers discovered before the user commits them to library.

use anyhow::Result;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::Row;

use super::db::Pool;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CandidatePaper {
    pub id: i64,
    pub title: String,
    pub authors: Vec<String>,
    pub year: Option<i32>,
    pub venue: Option<String>,
    pub doi: Option<String>,
    pub arxiv_id: Option<String>,
    pub abstract_text: Option<String>,
    pub source_type: String,
    pub source_url: Option<String>,
    pub status: String,
    pub related_project: Option<String>,
    pub created_at: i64,
    pub last_seen_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CandidateDraft {
    pub title: String,
    pub authors: Vec<String>,
    pub year: Option<i32>,
    pub venue: Option<String>,
    pub doi: Option<String>,
    pub arxiv_id: Option<String>,
    pub abstract_text: Option<String>,
    pub source_type: String,
    pub source_url: Option<String>,
}

pub struct CandidateRepo<'a> {
    pool: &'a Pool,
}

impl<'a> CandidateRepo<'a> {
    pub fn new(pool: &'a Pool) -> Self {
        Self { pool }
    }

    pub async fn upsert(&self, draft: &CandidateDraft) -> Result<CandidatePaper> {
        let now = Utc::now().timestamp();
        let authors_json = serde_json::to_string(&draft.authors)?;
        let normalized_title = normalize_title(&draft.title);
        let row = sqlx::query(
            "INSERT INTO candidate_papers
             (title, normalized_title, authors_json, year, venue, doi, arxiv_id, abstract_text,
              source_type, source_url, status, created_at, last_seen_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'new', ?11, ?11)
             ON CONFLICT DO UPDATE SET
              title = excluded.title,
              normalized_title = excluded.normalized_title,
              authors_json = excluded.authors_json,
              year = excluded.year,
              venue = excluded.venue,
              abstract_text = excluded.abstract_text,
              source_type = excluded.source_type,
              source_url = excluded.source_url,
              last_seen_at = excluded.last_seen_at
             RETURNING *",
        )
        .bind(draft.title.trim())
        .bind(normalized_title)
        .bind(authors_json)
        .bind(draft.year)
        .bind(trimmed_optional(draft.venue.as_deref()))
        .bind(trimmed_optional(draft.doi.as_deref()))
        .bind(trimmed_optional(draft.arxiv_id.as_deref()))
        .bind(trimmed_optional(draft.abstract_text.as_deref()))
        .bind(draft.source_type.trim())
        .bind(trimmed_optional(draft.source_url.as_deref()))
        .bind(now)
        .fetch_one(self.pool)
        .await?;
        row_to_candidate(row)
    }

    pub async fn list(&self, include_ignored: bool) -> Result<Vec<CandidatePaper>> {
        let sql = if include_ignored {
            "SELECT * FROM candidate_papers ORDER BY last_seen_at DESC"
        } else {
            "SELECT * FROM candidate_papers WHERE status != 'ignored' ORDER BY last_seen_at DESC"
        };
        let rows = sqlx::query(sql).fetch_all(self.pool).await?;
        rows.into_iter().map(row_to_candidate).collect()
    }

    pub async fn update_status(&self, id: i64, status: &str) -> Result<()> {
        sqlx::query("UPDATE candidate_papers SET status = ?1 WHERE id = ?2")
            .bind(status)
            .bind(id)
            .execute(self.pool)
            .await?;
        Ok(())
    }
}

fn row_to_candidate(row: sqlx::sqlite::SqliteRow) -> Result<CandidatePaper> {
    let authors_json: String = row.try_get("authors_json")?;
    Ok(CandidatePaper {
        id: row.try_get("id")?,
        title: row.try_get("title")?,
        authors: serde_json::from_str(&authors_json).unwrap_or_default(),
        year: row.try_get("year")?,
        venue: row.try_get("venue")?,
        doi: row.try_get("doi")?,
        arxiv_id: row.try_get("arxiv_id")?,
        abstract_text: row.try_get("abstract_text")?,
        source_type: row.try_get("source_type")?,
        source_url: row.try_get("source_url")?,
        status: row.try_get("status")?,
        related_project: row.try_get("related_project")?,
        created_at: row.try_get("created_at")?,
        last_seen_at: row.try_get("last_seen_at")?,
    })
}

fn trimmed_optional(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn normalize_title(value: &str) -> String {
    let mut normalized = String::new();
    let mut previous_was_space = true;
    for ch in value.chars().flat_map(char::to_lowercase) {
        if ch.is_alphanumeric() {
            normalized.push(ch);
            previous_was_space = false;
        } else if ch.is_whitespace() && !previous_was_space {
            normalized.push(' ');
            previous_was_space = true;
        }
    }
    normalized.trim().to_string()
}
