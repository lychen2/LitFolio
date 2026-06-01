//! Project evidence board items.

use anyhow::{anyhow, Context, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::Row;

use super::db::Pool;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EvidenceItem {
    pub id: i64,
    pub project_id: i64,
    pub source_type: String,
    pub paper_id: Option<String>,
    pub paper_title: Option<String>,
    pub highlight_id: Option<String>,
    pub page: Option<i32>,
    pub label: Option<String>,
    pub excerpt: String,
    pub note: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EvidenceDraft {
    pub source_type: String,
    pub paper_id: Option<String>,
    pub highlight_id: Option<String>,
    pub page: Option<i32>,
    pub label: Option<String>,
    pub excerpt: String,
    pub note: Option<String>,
}

pub struct EvidenceRepo<'a> {
    pool: &'a Pool,
}

impl<'a> EvidenceRepo<'a> {
    pub fn new(pool: &'a Pool) -> Self {
        Self { pool }
    }

    pub async fn list(&self, project_id: i64) -> Result<Vec<EvidenceItem>> {
        let rows = sqlx::query(
            "SELECT e.*, p.title AS paper_title
             FROM evidence_items e
             LEFT JOIN papers p ON p.id = e.paper_id
             WHERE e.project_id = ?1
             ORDER BY e.created_at DESC",
        )
        .bind(project_id)
        .fetch_all(self.pool)
        .await
        .context("list evidence")?;
        rows.into_iter().map(row_to_evidence).collect()
    }

    pub async fn add(&self, project_id: i64, draft: &EvidenceDraft) -> Result<EvidenceItem> {
        validate_draft(draft)?;
        let now = Utc::now().timestamp();
        let id = sqlx::query(
            "INSERT INTO evidence_items
             (project_id, source_type, paper_id, highlight_id, page, label, excerpt, note, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)",
        )
        .bind(project_id)
        .bind(draft.source_type.trim())
        .bind(trimmed_optional(draft.paper_id.as_deref()))
        .bind(trimmed_optional(draft.highlight_id.as_deref()))
        .bind(draft.page)
        .bind(trimmed_optional(draft.label.as_deref()))
        .bind(draft.excerpt.trim())
        .bind(trimmed_optional(draft.note.as_deref()))
        .bind(now)
        .execute(self.pool)
        .await
        .context("add evidence")?
        .last_insert_rowid();
        self.get(id)
            .await?
            .ok_or_else(|| anyhow!("created evidence missing"))
    }

    pub async fn add_from_highlight(
        &self,
        project_id: i64,
        highlight_id: &str,
    ) -> Result<EvidenceItem> {
        let row =
            sqlx::query("SELECT paper_id, page, label, text, note FROM highlights WHERE id = ?1")
                .bind(highlight_id)
                .fetch_optional(self.pool)
                .await
                .context("load highlight for evidence")?
                .ok_or_else(|| anyhow!("highlight {highlight_id} not found"))?;
        let draft = EvidenceDraft {
            source_type: "highlight".into(),
            paper_id: row.try_get("paper_id")?,
            highlight_id: Some(highlight_id.into()),
            page: row.try_get("page")?,
            label: row.try_get("label").unwrap_or(None),
            excerpt: row.try_get("text")?,
            note: row.try_get("note").unwrap_or(None),
        };
        self.add(project_id, &draft).await
    }

    pub async fn delete(&self, id: i64) -> Result<()> {
        let result = sqlx::query("DELETE FROM evidence_items WHERE id = ?1")
            .bind(id)
            .execute(self.pool)
            .await
            .context("delete evidence")?;
        if result.rows_affected() == 0 {
            return Err(anyhow!("evidence {id} not found"));
        }
        Ok(())
    }

    async fn get(&self, id: i64) -> Result<Option<EvidenceItem>> {
        let row = sqlx::query(
            "SELECT e.*, p.title AS paper_title
             FROM evidence_items e
             LEFT JOIN papers p ON p.id = e.paper_id
             WHERE e.id = ?1",
        )
        .bind(id)
        .fetch_optional(self.pool)
        .await
        .context("get evidence")?;
        row.map(row_to_evidence).transpose()
    }
}

fn row_to_evidence(row: sqlx::sqlite::SqliteRow) -> Result<EvidenceItem> {
    Ok(EvidenceItem {
        id: row.try_get("id")?,
        project_id: row.try_get("project_id")?,
        source_type: row.try_get("source_type")?,
        paper_id: row.try_get("paper_id")?,
        paper_title: row.try_get("paper_title").unwrap_or(None),
        highlight_id: row.try_get("highlight_id")?,
        page: row.try_get("page")?,
        label: row.try_get("label")?,
        excerpt: row.try_get("excerpt")?,
        note: row.try_get("note")?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}

fn validate_draft(draft: &EvidenceDraft) -> Result<()> {
    if draft.source_type.trim().is_empty() {
        return Err(anyhow!("evidence source type is required"));
    }
    if draft.excerpt.trim().is_empty() {
        return Err(anyhow!("evidence excerpt is required"));
    }
    Ok(())
}

fn trimmed_optional(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}
