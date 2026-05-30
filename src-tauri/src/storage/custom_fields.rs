//! Custom metadata fields: user-defined key-value pairs per paper.

use anyhow::{Context, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::Row;

use super::db::Pool;

/// A custom field definition (global).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomFieldDef {
    pub id: i64,
    pub name: String,
    pub field_type: String, // "text", "number", "date", "select"
    pub options: Option<Vec<String>>,
    pub created_at: i64,
}

/// A paper's value for a custom field.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaperCustomField {
    pub field_id: i64,
    pub field_name: String,
    pub field_type: String,
    pub options: Option<Vec<String>>,
    pub value: String,
}

pub struct CustomFieldRepo<'a> {
    pool: &'a Pool,
}

impl<'a> CustomFieldRepo<'a> {
    pub fn new(pool: &'a Pool) -> Self {
        Self { pool }
    }

    // ── Field definitions ──────────────────────────────────────────────

    pub async fn list_defs(&self) -> Result<Vec<CustomFieldDef>> {
        let rows = sqlx::query(
            "SELECT id, name, field_type, options, created_at FROM custom_field_defs ORDER BY name",
        )
        .fetch_all(self.pool)
        .await
        .context("list custom field defs")?;

        Ok(rows.into_iter().map(|r| row_to_def(&r)).collect())
    }

    pub async fn create_def(
        &self,
        name: &str,
        field_type: &str,
        options: Option<&[String]>,
    ) -> Result<i64> {
        let now = Utc::now().timestamp();
        let options_json = options.map(|o| serde_json::to_string(o).unwrap_or_default());
        let id = sqlx::query(
            "INSERT INTO custom_field_defs (name, field_type, options, created_at) VALUES (?1, ?2, ?3, ?4)",
        )
        .bind(name)
        .bind(field_type)
        .bind(&options_json)
        .bind(now)
        .execute(self.pool)
        .await
        .context("create custom field def")?
        .last_insert_rowid();
        Ok(id)
    }

    pub async fn delete_def(&self, id: i64) -> Result<()> {
        sqlx::query("DELETE FROM custom_field_defs WHERE id = ?1")
            .bind(id)
            .execute(self.pool)
            .await
            .context("delete custom field def")?;
        Ok(())
    }

    // ── Paper field values ─────────────────────────────────────────────

    pub async fn get_paper_fields(&self, paper_id: &str) -> Result<Vec<PaperCustomField>> {
        let rows = sqlx::query(
            "SELECT f.field_id, d.name AS field_name, d.field_type, d.options, f.value
             FROM paper_custom_fields f
             JOIN custom_field_defs d ON d.id = f.field_id
             WHERE f.paper_id = ?1
             ORDER BY d.name",
        )
        .bind(paper_id)
        .fetch_all(self.pool)
        .await
        .context("get paper custom fields")?;

        Ok(rows
            .into_iter()
            .map(|r| {
                let options_json: Option<String> = r.try_get("options").unwrap_or(None);
                PaperCustomField {
                    field_id: r.try_get("field_id").unwrap_or(0),
                    field_name: r.try_get("field_name").unwrap_or_default(),
                    field_type: r.try_get("field_type").unwrap_or_default(),
                    options: options_json.and_then(|j| serde_json::from_str(&j).ok()),
                    value: r.try_get("value").unwrap_or_default(),
                }
            })
            .collect())
    }

    pub async fn set_paper_field(&self, paper_id: &str, field_id: i64, value: &str) -> Result<()> {
        sqlx::query(
            "INSERT INTO paper_custom_fields (paper_id, field_id, value) VALUES (?1, ?2, ?3)
             ON CONFLICT(paper_id, field_id) DO UPDATE SET value = ?3",
        )
        .bind(paper_id)
        .bind(field_id)
        .bind(value)
        .execute(self.pool)
        .await
        .context("set paper custom field")?;
        Ok(())
    }

    pub async fn delete_paper_field(&self, paper_id: &str, field_id: i64) -> Result<()> {
        sqlx::query("DELETE FROM paper_custom_fields WHERE paper_id = ?1 AND field_id = ?2")
            .bind(paper_id)
            .bind(field_id)
            .execute(self.pool)
            .await
            .context("delete paper custom field")?;
        Ok(())
    }
}

fn row_to_def(r: &sqlx::sqlite::SqliteRow) -> CustomFieldDef {
    let options_json: Option<String> = r.try_get("options").unwrap_or(None);
    CustomFieldDef {
        id: r.try_get("id").unwrap_or(0),
        name: r.try_get("name").unwrap_or_default(),
        field_type: r.try_get("field_type").unwrap_or_default(),
        options: options_json.and_then(|j| serde_json::from_str(&j).ok()),
        created_at: r.try_get("created_at").unwrap_or(0),
    }
}
