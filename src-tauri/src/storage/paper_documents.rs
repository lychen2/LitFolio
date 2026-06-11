use std::collections::HashMap;

use anyhow::Result;
use chrono::Utc;
use sqlx::Row;

use super::db::Pool;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PaperDocumentIndexStatus {
    pub paper_id: String,
    pub status: String,
    pub error: Option<String>,
    pub indexed_at: Option<i64>,
}

pub struct PaperDocumentRepo<'a> {
    pool: &'a Pool,
}

impl<'a> PaperDocumentRepo<'a> {
    pub fn new(pool: &'a Pool) -> Self {
        Self { pool }
    }

    pub async fn upsert_markdown(&self, paper_id: &str, markdown: &str) -> Result<()> {
        let now = Utc::now().timestamp();
        sqlx::query(
            "INSERT INTO paper_documents (paper_id, markdown, updated_at, index_status, index_error, indexed_at)
             VALUES (?1, ?2, ?3, 'indexed', NULL, ?3)
             ON CONFLICT(paper_id) DO UPDATE SET
                markdown = excluded.markdown,
                updated_at = excluded.updated_at,
                index_status = 'indexed',
                index_error = NULL,
                indexed_at = excluded.indexed_at",
        )
        .bind(paper_id)
        .bind(markdown)
        .bind(now)
        .execute(self.pool)
        .await?;
        Ok(())
    }

    pub async fn mark_index_failed(&self, paper_id: &str, error: &str) -> Result<()> {
        let now = Utc::now().timestamp();
        sqlx::query(
            "INSERT INTO paper_documents (paper_id, markdown, updated_at, index_status, index_error, indexed_at)
             VALUES (?1, '', ?2, 'failed', ?3, ?2)
             ON CONFLICT(paper_id) DO UPDATE SET
                index_status = 'failed',
                index_error = excluded.index_error,
                indexed_at = excluded.indexed_at,
                updated_at = excluded.updated_at",
        )
        .bind(paper_id)
        .bind(now)
        .bind(error)
        .execute(self.pool)
        .await?;
        Ok(())
    }

    pub async fn index_status_for_papers(
        &self,
        paper_ids: &[String],
    ) -> Result<HashMap<String, PaperDocumentIndexStatus>> {
        let mut out = HashMap::with_capacity(paper_ids.len());
        for paper_id in paper_ids {
            let row = sqlx::query(
                "SELECT paper_id, index_status, index_error, indexed_at
                 FROM paper_documents
                 WHERE paper_id = ?1",
            )
            .bind(paper_id)
            .fetch_optional(self.pool)
            .await?;
            let Some(row) = row else {
                continue;
            };
            out.insert(
                paper_id.clone(),
                PaperDocumentIndexStatus {
                    paper_id: row.try_get("paper_id")?,
                    status: row.try_get("index_status")?,
                    error: row.try_get("index_error")?,
                    indexed_at: row.try_get("indexed_at")?,
                },
            );
        }
        Ok(out)
    }

    pub async fn markdown_for_papers(
        &self,
        paper_ids: &[String],
    ) -> Result<HashMap<String, String>> {
        let mut out = HashMap::with_capacity(paper_ids.len());
        for paper_id in paper_ids {
            let row = sqlx::query("SELECT markdown FROM paper_documents WHERE paper_id = ?1")
                .bind(paper_id)
                .fetch_optional(self.pool)
                .await?;
            if let Some(row) = row {
                let markdown: String = row.try_get("markdown")?;
                if !markdown.trim().is_empty() {
                    out.insert(paper_id.clone(), markdown);
                }
            }
        }
        Ok(out)
    }
}
