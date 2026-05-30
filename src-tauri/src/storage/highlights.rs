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

pub struct HighlightTranslationUpdate<'a> {
    pub text: &'a str,
    pub target_lang: &'a str,
    pub model: &'a str,
    pub translated_at: i64,
}

pub struct HighlightSummaryUpdate<'a> {
    pub text: &'a str,
    pub model: &'a str,
    pub summarized_at: i64,
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
        label: Option<&str>,
    ) -> Result<Highlight> {
        let id = Ulid::new().to_string();
        let rect_json = serde_json::to_string(rect)?;
        let color = color.unwrap_or("yellow");
        let created_at = Utc::now().timestamp();
        sqlx::query(
            "INSERT INTO highlights (id, paper_id, page, rect_json, color, label, text, note, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, ?8)",
        )
        .bind(&id)
        .bind(paper_id)
        .bind(page)
        .bind(&rect_json)
        .bind(color)
        .bind(label)
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
            label: label.map(|s| s.into()),
            text: text.into(),
            note: None,
            summary_text: None,
            summary_model: None,
            summarized_at: None,
            translation_text: None,
            translation_target_lang: None,
            translation_model: None,
            translated_at: None,
            created_at,
        })
    }

    pub async fn list_by_paper(&self, paper_id: &str) -> Result<Vec<Highlight>> {
        let rows = sqlx::query(
            "SELECT id, paper_id, page, rect_json, color, label, text, note,
                    summary_text, summary_model, summarized_at,
                    translation_text, translation_target_lang, translation_model, translated_at,
                    created_at
             FROM highlights WHERE paper_id = ?1 ORDER BY page ASC, created_at ASC",
        )
        .bind(paper_id)
        .fetch_all(self.pool)
        .await
        .context("list highlights")?;
        rows.into_iter().map(row_to_highlight).collect()
    }

    pub async fn get(&self, id: &str) -> Result<Option<Highlight>> {
        let row = sqlx::query(
            "SELECT id, paper_id, page, rect_json, color, label, text, note,
                    summary_text, summary_model, summarized_at,
                    translation_text, translation_target_lang, translation_model, translated_at,
                    created_at
             FROM highlights WHERE id = ?1",
        )
        .bind(id)
        .fetch_optional(self.pool)
        .await
        .context("get highlight")?;
        row.map(row_to_highlight).transpose()
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

    pub async fn update_translation(
        &self,
        id: &str,
        payload: &HighlightTranslationUpdate<'_>,
    ) -> Result<()> {
        let result = sqlx::query(
            "UPDATE highlights
             SET translation_text = ?1,
                 translation_target_lang = ?2,
                 translation_model = ?3,
                 translated_at = ?4
             WHERE id = ?5",
        )
        .bind(payload.text)
        .bind(payload.target_lang)
        .bind(payload.model)
        .bind(payload.translated_at)
        .bind(id)
        .execute(self.pool)
        .await
        .context("update highlight translation")?;
        if result.rows_affected() == 0 {
            return Err(anyhow::anyhow!("highlight {id} not found"));
        }
        Ok(())
    }

    pub async fn update_summary(
        &self,
        id: &str,
        payload: &HighlightSummaryUpdate<'_>,
    ) -> Result<()> {
        let result = sqlx::query(
            "UPDATE highlights
             SET summary_text = ?1,
                 summary_model = ?2,
                 summarized_at = ?3
             WHERE id = ?4",
        )
        .bind(payload.text)
        .bind(payload.model)
        .bind(payload.summarized_at)
        .bind(id)
        .execute(self.pool)
        .await
        .context("update highlight summary")?;
        if result.rows_affected() == 0 {
            return Err(anyhow::anyhow!("highlight {id} not found"));
        }
        Ok(())
    }

    pub async fn update_label(&self, id: &str, label: Option<&str>) -> Result<()> {
        let res = match label {
            Some(l) => {
                sqlx::query("UPDATE highlights SET label = ?1 WHERE id = ?2")
                    .bind(l)
                    .bind(id)
                    .execute(self.pool)
                    .await
            }
            None => {
                sqlx::query("UPDATE highlights SET label = NULL WHERE id = ?1")
                    .bind(id)
                    .execute(self.pool)
                    .await
            }
        };
        let res = res.context("update highlight label")?;
        if res.rows_affected() == 0 {
            return Err(anyhow::anyhow!("highlight {id} not found"));
        }
        Ok(())
    }
}

fn row_to_highlight(row: sqlx::sqlite::SqliteRow) -> Result<Highlight> {
    let rect_raw: String = row.try_get("rect_json")?;
    let note: Option<String> = row.try_get("note").unwrap_or(None);
    Ok(Highlight {
        id: row.try_get("id")?,
        paper_id: row.try_get("paper_id")?,
        page: row.try_get("page")?,
        rect: serde_json::from_str(&rect_raw).unwrap_or(serde_json::Value::Null),
        color: row.try_get("color")?,
        label: row.try_get("label").unwrap_or(None),
        text: row.try_get("text")?,
        note,
        summary_text: row.try_get("summary_text").unwrap_or(None),
        summary_model: row.try_get("summary_model").unwrap_or(None),
        summarized_at: row.try_get("summarized_at").unwrap_or(None),
        translation_text: row.try_get("translation_text").unwrap_or(None),
        translation_target_lang: row.try_get("translation_target_lang").unwrap_or(None),
        translation_model: row.try_get("translation_model").unwrap_or(None),
        translated_at: row.try_get("translated_at").unwrap_or(None),
        created_at: row.try_get("created_at")?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::db::{open_pool, run_migrations};
    use crate::storage::models::{Paper, ReadStatus};
    use crate::storage::papers::PaperRepo;
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
            bibtex: None,
            last_exported_at: None,
        };
        PaperRepo::new(pool).insert(&p).await.unwrap();
    }

    #[tokio::test]
    async fn insert_list_update_delete_roundtrip() {
        let (pool, dir) = temp_pool().await;
        seed_paper(&pool, "A").await;
        let repo = HighlightRepo::new(&pool);
        let rect = serde_json::json!({"x":10,"y":20,"w":100,"h":15});
        let h1 = repo
            .insert("A", 1, &rect, "hello world", None, None)
            .await
            .unwrap();
        let h2 = repo
            .insert("A", 2, &rect, "second hl", Some("green"), Some("method"))
            .await
            .unwrap();
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

        repo.update_translation(
            &h1.id,
            &HighlightTranslationUpdate {
                text: "你好",
                target_lang: "Chinese",
                model: "test-model",
                translated_at: 42,
            },
        )
        .await
        .unwrap();
        let translated = repo.get(&h1.id).await.unwrap().unwrap();
        assert_eq!(translated.translation_text.as_deref(), Some("你好"));
        assert_eq!(
            translated.translation_target_lang.as_deref(),
            Some("Chinese")
        );
        assert_eq!(translated.translation_model.as_deref(), Some("test-model"));
        assert_eq!(translated.translated_at, Some(42));

        repo.update_summary(
            &h1.id,
            &HighlightSummaryUpdate {
                text: "一句话总结",
                model: "summary-model",
                summarized_at: 99,
            },
        )
        .await
        .unwrap();
        let summarized = repo.get(&h1.id).await.unwrap().unwrap();
        assert_eq!(summarized.summary_text.as_deref(), Some("一句话总结"));
        assert_eq!(summarized.summary_model.as_deref(), Some("summary-model"));
        assert_eq!(summarized.summarized_at, Some(99));

        repo.delete(&h2.id).await.unwrap();
        assert_eq!(repo.list_by_paper("A").await.unwrap().len(), 1);

        assert!(repo.update_note("nonexistent", Some("x")).await.is_err());
        assert!(repo
            .update_translation(
                "nonexistent",
                &HighlightTranslationUpdate {
                    text: "x",
                    target_lang: "Chinese",
                    model: "m",
                    translated_at: 1,
                },
            )
            .await
            .is_err());
        assert!(repo
            .update_summary(
                "nonexistent",
                &HighlightSummaryUpdate {
                    text: "x",
                    model: "m",
                    summarized_at: 1,
                },
            )
            .await
            .is_err());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn delete_cascades_when_paper_deleted() {
        let (pool, dir) = temp_pool().await;
        seed_paper(&pool, "P").await;
        let repo = HighlightRepo::new(&pool);
        let rect = serde_json::json!({"x":0,"y":0,"w":1,"h":1});
        repo.insert("P", 1, &rect, "x", None, None).await.unwrap();
        repo.insert("P", 1, &rect, "y", None, None).await.unwrap();
        PaperRepo::new(&pool).delete("P").await.unwrap();
        assert!(repo.list_by_paper("P").await.unwrap().is_empty());
        std::fs::remove_dir_all(&dir).ok();
    }
}
