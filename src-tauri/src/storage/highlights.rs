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

pub struct HighlightExplanationUpdate<'a> {
    pub text: &'a str,
    pub model: &'a str,
    pub explained_at: i64,
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
            explanation_text: None,
            explanation_model: None,
            explained_at: None,
            created_at,
        })
    }

    pub async fn list_by_paper(&self, paper_id: &str) -> Result<Vec<Highlight>> {
        let rows = sqlx::query(
            "SELECT id, paper_id, page, rect_json, color, label, text, note,
                    summary_text, summary_model, summarized_at,
                    translation_text, translation_target_lang, translation_model, translated_at,
                    explanation_text, explanation_model, explained_at,
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
                    explanation_text, explanation_model, explained_at,
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

    pub async fn update_rect(&self, id: &str, rect: &serde_json::Value) -> Result<()> {
        let rect_json = serde_json::to_string(rect)?;
        let res = sqlx::query("UPDATE highlights SET rect_json = ?1 WHERE id = ?2")
            .bind(rect_json)
            .bind(id)
            .execute(self.pool)
            .await
            .context("update highlight rect")?;
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

    pub async fn update_explanation(
        &self,
        id: &str,
        payload: &HighlightExplanationUpdate<'_>,
    ) -> Result<()> {
        let result = sqlx::query(
            "UPDATE highlights
             SET explanation_text = ?1,
                 explanation_model = ?2,
                 explained_at = ?3
             WHERE id = ?4",
        )
        .bind(payload.text)
        .bind(payload.model)
        .bind(payload.explained_at)
        .bind(id)
        .execute(self.pool)
        .await
        .context("update highlight explanation")?;
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
        rect: serde_json::from_str(&rect_raw).context("parse highlight rect_json")?,
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
        explanation_text: row.try_get("explanation_text").unwrap_or(None),
        explanation_model: row.try_get("explanation_model").unwrap_or(None),
        explained_at: row.try_get("explained_at").unwrap_or(None),
        created_at: row.try_get("created_at")?,
    })
}

#[cfg(test)]
mod tests;
