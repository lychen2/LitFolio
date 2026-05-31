use anyhow::{Context, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::Row;

use super::db::Pool;

mod graph;
mod types;

pub use types::{GraphData, GraphEdge, GraphFilter, GraphNode};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaperLink {
    pub id: i64,
    pub source_paper_id: String,
    pub target_paper_id: String,
    pub relation: String,
    pub source_type: String,
    pub confidence: f64,
    pub snippet: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

pub struct PaperLinkRepo<'a> {
    pool: &'a Pool,
}

impl<'a> PaperLinkRepo<'a> {
    pub fn new(pool: &'a Pool) -> Self {
        Self { pool }
    }

    pub async fn create(
        &self,
        source_paper_id: &str,
        target_paper_id: &str,
        relation: &str,
        source_type: &str,
        confidence: f64,
        snippet: Option<&str>,
    ) -> Result<PaperLink> {
        let now = Utc::now().timestamp();
        let id = sqlx::query(
            "INSERT INTO paper_links
             (source_paper_id, target_paper_id, relation, source_type, confidence, snippet, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
        )
        .bind(source_paper_id)
        .bind(target_paper_id)
        .bind(relation)
        .bind(source_type)
        .bind(confidence)
        .bind(snippet)
        .bind(now)
        .execute(self.pool)
        .await
        .context("create paper link")?
        .last_insert_rowid();
        self.get(id).await
    }

    pub async fn create_or_get(
        &self,
        source_paper_id: &str,
        target_paper_id: &str,
        relation: &str,
        source_type: &str,
        confidence: f64,
        snippet: Option<&str>,
    ) -> Result<PaperLink> {
        if let Some(existing) = self
            .find(source_paper_id, target_paper_id, relation)
            .await?
        {
            return Ok(existing);
        }
        self.create(
            source_paper_id,
            target_paper_id,
            relation,
            source_type,
            confidence,
            snippet,
        )
        .await
    }

    async fn find(
        &self,
        source_paper_id: &str,
        target_paper_id: &str,
        relation: &str,
    ) -> Result<Option<PaperLink>> {
        let row = sqlx::query(
            "SELECT id, source_paper_id, target_paper_id, relation, source_type,
                    confidence, snippet, created_at, updated_at
             FROM paper_links
             WHERE source_paper_id = ?1 AND target_paper_id = ?2 AND relation = ?3",
        )
        .bind(source_paper_id)
        .bind(target_paper_id)
        .bind(relation)
        .fetch_optional(self.pool)
        .await
        .context("find paper link")?;
        row.map(row_to_link).transpose()
    }

    pub async fn get(&self, id: i64) -> Result<PaperLink> {
        let row = sqlx::query(
            "SELECT id, source_paper_id, target_paper_id, relation, source_type,
                    confidence, snippet, created_at, updated_at
             FROM paper_links WHERE id = ?1",
        )
        .bind(id)
        .fetch_one(self.pool)
        .await
        .context("get paper link")?;
        row_to_link(row)
    }

    pub async fn delete(&self, id: i64) -> Result<()> {
        sqlx::query("DELETE FROM paper_links WHERE id = ?1")
            .bind(id)
            .execute(self.pool)
            .await
            .context("delete paper link")?;
        Ok(())
    }

    pub async fn list_for_paper(&self, paper_id: &str) -> Result<Vec<PaperLink>> {
        let rows = sqlx::query(
            "SELECT id, source_paper_id, target_paper_id, relation, source_type,
                    confidence, snippet, created_at, updated_at
             FROM paper_links
             WHERE source_paper_id = ?1 OR target_paper_id = ?1
             ORDER BY updated_at DESC",
        )
        .bind(paper_id)
        .fetch_all(self.pool)
        .await
        .context("list links for paper")?;
        rows.into_iter().map(row_to_link).collect()
    }

    pub async fn list_all(&self) -> Result<Vec<PaperLink>> {
        let rows = sqlx::query(
            "SELECT id, source_paper_id, target_paper_id, relation, source_type,
                    confidence, snippet, created_at, updated_at
             FROM paper_links
             ORDER BY updated_at DESC",
        )
        .fetch_all(self.pool)
        .await
        .context("list all paper links")?;
        rows.into_iter().map(row_to_link).collect()
    }

    pub async fn accept_ai_link(&self, id: i64) -> Result<()> {
        let now = Utc::now().timestamp();
        sqlx::query(
            "UPDATE paper_links SET confidence = 1.0, source_type = 'user', updated_at = ?1
             WHERE id = ?2",
        )
        .bind(now)
        .bind(id)
        .execute(self.pool)
        .await
        .context("accept ai link")?;
        Ok(())
    }

    pub async fn bulk_insert_ai(
        &self,
        links: &[(String, String, String, f64, String)],
    ) -> Result<usize> {
        let mut tx = self.pool.begin().await.context("begin bulk insert")?;
        let now = Utc::now().timestamp();
        let mut count = 0usize;
        for (src, tgt, rel, conf, snip) in links {
            let res = sqlx::query(
                "INSERT OR IGNORE INTO paper_links
                 (source_paper_id, target_paper_id, relation, source_type, confidence, snippet, created_at, updated_at)
                 VALUES (?1, ?2, ?3, 'ai', ?4, ?5, ?6, ?6)",
            )
            .bind(src)
            .bind(tgt)
            .bind(rel)
            .bind(conf)
            .bind(snip)
            .bind(now)
            .execute(&mut *tx)
            .await
            .context("insert ai link")?;
            count += res.rows_affected() as usize;
        }
        tx.commit().await.context("commit bulk insert")?;
        Ok(count)
    }
}

fn row_to_link(row: sqlx::sqlite::SqliteRow) -> Result<PaperLink> {
    Ok(PaperLink {
        id: row.try_get("id")?,
        source_paper_id: row.try_get("source_paper_id")?,
        target_paper_id: row.try_get("target_paper_id")?,
        relation: row.try_get("relation")?,
        source_type: row.try_get("source_type")?,
        confidence: row.try_get("confidence")?,
        snippet: row.try_get("snippet")?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}
