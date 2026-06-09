use std::collections::HashMap;

use anyhow::Result;
use chrono::Utc;
use sqlx::Row;

use super::db::Pool;

pub struct PaperDocumentRepo<'a> {
    pool: &'a Pool,
}

impl<'a> PaperDocumentRepo<'a> {
    pub fn new(pool: &'a Pool) -> Self {
        Self { pool }
    }

    pub async fn upsert_markdown(&self, paper_id: &str, markdown: &str) -> Result<()> {
        sqlx::query(
            "INSERT INTO paper_documents (paper_id, markdown, updated_at)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(paper_id) DO UPDATE SET
                markdown = excluded.markdown,
                updated_at = excluded.updated_at",
        )
        .bind(paper_id)
        .bind(markdown)
        .bind(Utc::now().timestamp())
        .execute(self.pool)
        .await?;
        Ok(())
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
