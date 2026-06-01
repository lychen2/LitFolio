//! Structured reading-card sections per paper.

use anyhow::Result;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::Row;

use super::db::Pool;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteSection {
    pub id: i64,
    pub paper_id: String,
    pub section_key: String,
    pub content: String,
    pub source: String,
    pub sort_order: i32,
    pub created_at: i64,
    pub updated_at: i64,
}

/// Default sections created for every paper.
pub const DEFAULT_SECTIONS: &[(&str, &str)] = &[
    ("problem", "Problem"),
    ("method", "Method"),
    ("key_findings", "Key Findings"),
    ("evidence", "Evidence"),
    ("limitations", "Limitations"),
    ("datasets", "Datasets"),
    ("metrics", "Metrics"),
    ("project_relation", "Relation To My Project"),
    ("quotes", "Cite-Worthy Quotes"),
    ("open_questions", "Open Questions"),
];

pub struct NoteSectionRepo<'a> {
    pool: &'a Pool,
}

impl<'a> NoteSectionRepo<'a> {
    pub fn new(pool: &'a Pool) -> Self {
        Self { pool }
    }

    /// Get all sections for a paper, ordered by sort_order.
    pub async fn list_by_paper(&self, paper_id: &str) -> Result<Vec<NoteSection>> {
        let rows = sqlx::query(
            "SELECT * FROM paper_note_sections WHERE paper_id = ?1 ORDER BY sort_order, id",
        )
        .bind(paper_id)
        .fetch_all(self.pool)
        .await?;
        rows.into_iter().map(row_to_section).collect()
    }

    /// Create default sections for a paper if they don't exist yet.
    pub async fn ensure_defaults(&self, paper_id: &str) -> Result<()> {
        let now = Utc::now().timestamp();
        for (idx, (key, _label)) in DEFAULT_SECTIONS.iter().enumerate() {
            sqlx::query(
                "INSERT OR IGNORE INTO paper_note_sections
                 (paper_id, section_key, content, source, sort_order, created_at, updated_at)
                 VALUES (?1, ?2, '', 'user', ?3, ?4, ?4)",
            )
            .bind(paper_id)
            .bind(key)
            .bind(idx as i32)
            .bind(now)
            .execute(self.pool)
            .await?;
        }
        Ok(())
    }

    /// Upsert a section's content.
    pub async fn save(
        &self,
        paper_id: &str,
        section_key: &str,
        content: &str,
        source: &str,
    ) -> Result<()> {
        let now = Utc::now().timestamp();
        sqlx::query(
            "INSERT INTO paper_note_sections
             (paper_id, section_key, content, source, sort_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, 0, ?5, ?5)
             ON CONFLICT(paper_id, section_key) DO UPDATE
             SET content = ?3, source = ?4, updated_at = ?5",
        )
        .bind(paper_id)
        .bind(section_key)
        .bind(content)
        .bind(source)
        .bind(now)
        .execute(self.pool)
        .await?;
        Ok(())
    }

    /// Reorder sections.
    pub async fn reorder(&self, paper_id: &str, section_ids: &[i64]) -> Result<()> {
        for (idx, &id) in section_ids.iter().enumerate() {
            sqlx::query(
                "UPDATE paper_note_sections SET sort_order = ?1 WHERE id = ?2 AND paper_id = ?3",
            )
            .bind(idx as i32)
            .bind(id)
            .bind(paper_id)
            .execute(self.pool)
            .await?;
        }
        Ok(())
    }

    /// Delete a section.
    pub async fn delete(&self, id: i64) -> Result<()> {
        sqlx::query("DELETE FROM paper_note_sections WHERE id = ?1")
            .bind(id)
            .execute(self.pool)
            .await?;
        Ok(())
    }
}

fn row_to_section(row: sqlx::sqlite::SqliteRow) -> Result<NoteSection> {
    Ok(NoteSection {
        id: row.try_get("id")?,
        paper_id: row.try_get("paper_id")?,
        section_key: row.try_get("section_key")?,
        content: row.try_get("content")?,
        source: row.try_get("source")?,
        sort_order: row.try_get("sort_order")?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}
