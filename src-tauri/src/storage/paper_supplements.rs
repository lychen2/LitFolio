use anyhow::Result;
use serde::{Deserialize, Serialize};
use sqlx::Row;

use super::db::Pool;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PaperSupplement {
    pub id: i64,
    pub paper_id: String,
    pub title: String,
    pub file_path: String,
    pub file_kind: String,
    pub note: String,
    pub converted_pdf_path: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewPaperSupplement {
    pub paper_id: String,
    pub title: String,
    pub file_path: String,
    pub file_kind: String,
}

pub struct PaperSupplementRepo<'a> {
    pool: &'a Pool,
}

impl<'a> PaperSupplementRepo<'a> {
    pub fn new(pool: &'a Pool) -> Self {
        Self { pool }
    }

    pub async fn list(&self, paper_id: &str) -> Result<Vec<PaperSupplement>> {
        let rows = sqlx::query(
            r#"SELECT id, paper_id, title, file_path, file_kind, note, converted_pdf_path, created_at, updated_at
               FROM paper_supplements
               WHERE paper_id = ?
               ORDER BY created_at DESC, id DESC"#,
        )
        .bind(paper_id)
        .fetch_all(self.pool)
        .await?;
        Ok(rows.into_iter().map(row_to_supplement).collect())
    }

    pub async fn get(&self, id: i64) -> Result<Option<PaperSupplement>> {
        let row = sqlx::query(
            r#"SELECT id, paper_id, title, file_path, file_kind, note, converted_pdf_path, created_at, updated_at
               FROM paper_supplements
               WHERE id = ?"#,
        )
        .bind(id)
        .fetch_optional(self.pool)
        .await?;
        Ok(row.map(row_to_supplement))
    }

    pub async fn insert(&self, draft: NewPaperSupplement, now: i64) -> Result<PaperSupplement> {
        let id = sqlx::query(
            r#"INSERT INTO paper_supplements (paper_id, title, file_path, file_kind, note, converted_pdf_path, created_at, updated_at)
               VALUES (?, ?, ?, ?, '', NULL, ?, ?)"#,
        )
        .bind(&draft.paper_id)
        .bind(&draft.title)
        .bind(&draft.file_path)
        .bind(&draft.file_kind)
        .bind(now)
        .bind(now)
        .execute(self.pool)
        .await?
        .last_insert_rowid();
        self.get(id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("paper supplement vanished after insert"))
    }

    pub async fn update_note(&self, id: i64, note: &str, now: i64) -> Result<PaperSupplement> {
        sqlx::query("UPDATE paper_supplements SET note = ?, updated_at = ? WHERE id = ?")
            .bind(note)
            .bind(now)
            .bind(id)
            .execute(self.pool)
            .await?;
        self.get(id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("paper supplement {id} not found"))
    }

    pub async fn update_converted_pdf_path(
        &self,
        id: i64,
        path: &str,
        now: i64,
    ) -> Result<PaperSupplement> {
        sqlx::query(
            "UPDATE paper_supplements SET converted_pdf_path = ?, updated_at = ? WHERE id = ?",
        )
        .bind(path)
        .bind(now)
        .bind(id)
        .execute(self.pool)
        .await?;
        self.get(id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("paper supplement {id} not found"))
    }

    pub async fn delete(&self, id: i64) -> Result<Option<PaperSupplement>> {
        let existing = self.get(id).await?;
        if existing.is_some() {
            sqlx::query("DELETE FROM paper_supplements WHERE id = ?")
                .bind(id)
                .execute(self.pool)
                .await?;
        }
        Ok(existing)
    }
}

fn row_to_supplement(row: sqlx::sqlite::SqliteRow) -> PaperSupplement {
    PaperSupplement {
        id: row.get("id"),
        paper_id: row.get("paper_id"),
        title: row.get("title"),
        file_path: row.get("file_path"),
        file_kind: row.get("file_kind"),
        note: row.get("note"),
        converted_pdf_path: row.get("converted_pdf_path"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }
}
