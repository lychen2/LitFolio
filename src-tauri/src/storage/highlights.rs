//! Highlight CRUD repository (per-paper text highlights with optional inline notes).

use anyhow::{Context, Result};
use chrono::Utc;
use sqlx::Row;
use ulid::Ulid;

use super::db::Pool;
use super::models::Highlight;

pub struct HighlightRepo<'a> {
    pool: &'a Pool,
}

impl<'a> HighlightRepo<'a> {
    pub fn new(pool: &'a Pool) -> Self {
        Self { pool }
    }

    pub async fn insert(
        &self,
        paper_id: &str,
        page: i32,
        rect: &serde_json::Value,
        text: &str,
        color: Option<&str>,
    ) -> Result<Highlight> {
        let id = Ulid::new().to_string();
        let rect_json = serde_json::to_string(rect)?;
        let color = color.unwrap_or("yellow");
        let created_at = Utc::now().timestamp();
        sqlx::query(
            "INSERT INTO highlights (id, paper_id, page, rect_json, color, text, note, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?7)",
        )
        .bind(&id)
        .bind(paper_id)
        .bind(page)
        .bind(&rect_json)
        .bind(color)
        .bind(text)
        .bind(created_at)
        .execute(self.pool)
        .await
        .context("insert highlight")?;
        Ok(Highlight {
            id,
            paper_id: paper_id.into(),
            page,
            rect: rect.clone(),
            color: color.into(),
            text: text.into(),
            note: None,
            created_at,
        })
    }

    pub async fn list_by_paper(&self, paper_id: &str) -> Result<Vec<Highlight>> {
        let rows = sqlx::query(
            "SELECT id, paper_id, page, rect_json, color, text, note, created_at
             FROM highlights WHERE paper_id = ?1 ORDER BY page ASC, created_at ASC",
        )
        .bind(paper_id)
        .fetch_all(self.pool)
        .await
        .context("list highlights")?;
        rows.into_iter().map(row_to_highlight).collect()
    }

    pub async fn update_note(&self, id: &str, note: Option<&str>) -> Result<()> {
        // Split Some/None into separate queries — relying on sqlx to encode `Option::<&str>::None`
        // as SQL NULL via a single bound query has bitten us once (the bound parameter ended up
        // being decoded as the empty string instead of NULL on SQLite). Two explicit queries is
        // simpler and unambiguous.
        let res = match note {
            Some(n) => {
                sqlx::query("UPDATE highlights SET note = ?1 WHERE id = ?2")
                    .bind(n)
                    .bind(id)
                    .execute(self.pool)
                    .await
            }
            None => {
                sqlx::query("UPDATE highlights SET note = NULL WHERE id = ?1")
                    .bind(id)
                    .execute(self.pool)
                    .await
            }
        };
        let res = res.context("update highlight note")?;
        if res.rows_affected() == 0 {
            return Err(anyhow::anyhow!("highlight {id} not found"));
        }
        Ok(())
    }

    pub async fn delete(&self, id: &str) -> Result<()> {
        sqlx::query("DELETE FROM highlights WHERE id = ?1")
            .bind(id)
            .execute(self.pool)
            .await
            .context("delete highlight")?;
        Ok(())
    }
}

fn row_to_highlight(row: sqlx::sqlite::SqliteRow) -> Result<Highlight> {
    let rect_raw: String = row.try_get("rect_json")?;
    // Use the explicit Option<String> form for nullable columns — `try_get(..).ok()` is
    // ambiguous: depending on type inference it can read the column as non-null String
    // and silently swallow real decode errors, OR (worse) read it as Option<String> and
    // assign Some(None) to fields. Asking for Option<String> directly gives unambiguous
    // NULL handling.
    let note: Option<String> = row.try_get("note").unwrap_or(None);
    Ok(Highlight {
        id: row.try_get("id")?,
        paper_id: row.try_get("paper_id")?,
        page: row.try_get("page")?,
        rect: serde_json::from_str(&rect_raw).unwrap_or(serde_json::Value::Null),
        color: row.try_get("color")?,
        text: row.try_get("text")?,
        note,
        created_at: row.try_get("created_at")?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::db::{open_pool, run_migrations};
    use crate::storage::papers::PaperRepo;
    use crate::storage::models::{Paper, ReadStatus};
    use std::path::PathBuf;

    async fn temp_pool() -> (Pool, PathBuf) {
        let dir = std::env::temp_dir().join(format!("litera-hl-{}", Ulid::new()));
        std::fs::create_dir_all(&dir).unwrap();
        let pool = open_pool(&dir.join("library.db")).await.unwrap();
        run_migrations(&pool).await.unwrap();
        (pool, dir)
    }

    async fn seed_paper(pool: &Pool, id: &str) {
        let now = Utc::now().timestamp();
        let p = Paper {
            id: id.into(),
            title: "T".into(),
            authors: vec![],
            year: None,
            venue: None,
            doi: None,
            arxiv_id: None,
            abstract_text: None,
            pdf_path: Some(format!("/tmp/{id}.pdf")),
            note_path: None,
            added_at: now,
            updated_at: now,
            read_status: ReadStatus::Unread,
            tldr: None,
            research_question: None,
            method: None,
            dataset: None,
            key_findings: vec![],
            limitations: None,
            comparison: None,
            title_translated: None,
            abstract_translated: None,
            translate_target_lang: None,
            translated_at: None,
        };
        PaperRepo::new(pool).insert(&p).await.unwrap();
    }

    #[tokio::test]
    async fn insert_list_update_delete_roundtrip() {
        let (pool, dir) = temp_pool().await;
        seed_paper(&pool, "A").await;
        let repo = HighlightRepo::new(&pool);
        let rect = serde_json::json!({"x":10,"y":20,"w":100,"h":15});
        let h1 = repo.insert("A", 1, &rect, "hello world", None).await.unwrap();
        let h2 = repo.insert("A", 2, &rect, "second hl", Some("green")).await.unwrap();
        let list = repo.list_by_paper("A").await.unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].page, 1);
        assert_eq!(list[0].color, "yellow");
        assert_eq!(list[1].color, "green");

        repo.update_note(&h1.id, Some("important")).await.unwrap();
        let list = repo.list_by_paper("A").await.unwrap();
        assert_eq!(list[0].note.as_deref(), Some("important"));

        repo.update_note(&h1.id, None).await.unwrap();
        let list = repo.list_by_paper("A").await.unwrap();
        assert!(list[0].note.is_none());

        repo.delete(&h2.id).await.unwrap();
        assert_eq!(repo.list_by_paper("A").await.unwrap().len(), 1);

        assert!(repo.update_note("nonexistent", Some("x")).await.is_err());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn delete_cascades_when_paper_deleted() {
        let (pool, dir) = temp_pool().await;
        seed_paper(&pool, "P").await;
        let repo = HighlightRepo::new(&pool);
        let rect = serde_json::json!({"x":0,"y":0,"w":1,"h":1});
        repo.insert("P", 1, &rect, "x", None).await.unwrap();
        repo.insert("P", 1, &rect, "y", None).await.unwrap();
        PaperRepo::new(&pool).delete("P").await.unwrap();
        assert!(repo.list_by_paper("P").await.unwrap().is_empty());
        std::fs::remove_dir_all(&dir).ok();
    }
}
