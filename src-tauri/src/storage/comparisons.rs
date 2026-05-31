//! Paper comparison CRUD — stores AI-generated comparison tables.

use anyhow::Result;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::Row;

use super::db::Pool;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaperComparison {
    pub id: i64,
    pub paper_ids: Vec<String>,
    pub content: String,
    pub model: String,
    pub created_at: i64,
    pub updated_at: i64,
}

pub struct ComparisonRepo<'a> {
    pool: &'a Pool,
}

impl<'a> ComparisonRepo<'a> {
    pub fn new(pool: &'a Pool) -> Self {
        Self { pool }
    }

    pub async fn insert(&self, paper_ids: &[String], content: &str, model: &str) -> Result<i64> {
        let now = Utc::now().timestamp();
        let ids_json = serde_json::to_string(paper_ids)?;
        let row = sqlx::query(
            "INSERT INTO paper_comparisons (paper_ids, content, model, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             RETURNING id",
        )
        .bind(&ids_json)
        .bind(content)
        .bind(model)
        .bind(now)
        .bind(now)
        .fetch_one(self.pool)
        .await?;
        Ok(row.get("id"))
    }

    pub async fn get(&self, id: i64) -> Result<Option<PaperComparison>> {
        let row = sqlx::query("SELECT * FROM paper_comparisons WHERE id = ?1")
            .bind(id)
            .fetch_optional(self.pool)
            .await?;
        row.map(row_to_comparison).transpose()
    }

    pub async fn list_all(&self) -> Result<Vec<PaperComparison>> {
        let rows = sqlx::query("SELECT * FROM paper_comparisons ORDER BY updated_at DESC")
            .fetch_all(self.pool)
            .await?;
        rows.into_iter().map(row_to_comparison).collect()
    }

    pub async fn update_content(&self, id: i64, content: &str) -> Result<()> {
        let now = Utc::now().timestamp();
        sqlx::query("UPDATE paper_comparisons SET content = ?1, updated_at = ?2 WHERE id = ?3")
            .bind(content)
            .bind(now)
            .bind(id)
            .execute(self.pool)
            .await?;
        Ok(())
    }

    pub async fn delete(&self, id: i64) -> Result<()> {
        sqlx::query("DELETE FROM paper_comparisons WHERE id = ?1")
            .bind(id)
            .execute(self.pool)
            .await?;
        Ok(())
    }
}

fn row_to_comparison(row: sqlx::sqlite::SqliteRow) -> Result<PaperComparison> {
    let ids_str: String = row.try_get("paper_ids")?;
    let paper_ids: Vec<String> = serde_json::from_str(&ids_str).unwrap_or_default();
    Ok(PaperComparison {
        id: row.try_get("id")?,
        paper_ids,
        content: row.try_get("content")?,
        model: row.try_get("model")?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}
