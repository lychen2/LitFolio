use anyhow::{Context, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::Row;

use super::db::Pool;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AskSession {
    pub id: String,
    pub project_id: Option<i64>,
    pub title: String,
    pub pinned_paper_ids: Vec<String>,
    pub model: Option<String>,
    pub conversation: Value,
    pub saved_artifacts: Value,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AskSessionDraft {
    pub id: Option<String>,
    pub project_id: Option<i64>,
    pub title: String,
    #[serde(default)]
    pub pinned_paper_ids: Vec<String>,
    pub model: Option<String>,
    #[serde(default = "empty_array")]
    pub conversation: Value,
    #[serde(default = "empty_array")]
    pub saved_artifacts: Value,
}

pub struct AskSessionRepo<'a> {
    pool: &'a Pool,
}

impl<'a> AskSessionRepo<'a> {
    pub fn new(pool: &'a Pool) -> Self {
        Self { pool }
    }

    pub async fn latest(&self, project_id: Option<i64>) -> Result<Option<AskSession>> {
        let row = match project_id {
            Some(project_id) => {
                sqlx::query(
                    "SELECT * FROM ask_sessions WHERE project_id = ? ORDER BY updated_at DESC LIMIT 1",
                )
                .bind(project_id)
                .fetch_optional(self.pool)
                .await?
            }
            None => {
                sqlx::query(
                    "SELECT * FROM ask_sessions WHERE project_id IS NULL ORDER BY updated_at DESC LIMIT 1",
                )
                .fetch_optional(self.pool)
                .await?
            }
        };
        row.map(row_to_session).transpose()
    }

    pub async fn save(&self, draft: AskSessionDraft) -> Result<AskSession> {
        let now_dt = Utc::now();
        let now = now_dt.timestamp();
        let id = draft
            .id
            .unwrap_or_else(|| format!("ask_{}", now_dt.timestamp_millis()));
        let title = normalize_title(&draft.title);
        let pinned_paper_ids = serde_json::to_string(&draft.pinned_paper_ids)?;
        let conversation_json = serde_json::to_string(&draft.conversation)?;
        let saved_artifacts_json = serde_json::to_string(&draft.saved_artifacts)?;
        sqlx::query(
            r#"INSERT INTO ask_sessions (
                id, project_id, title, pinned_paper_ids, model, conversation_json,
                saved_artifacts_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                project_id = excluded.project_id,
                title = excluded.title,
                pinned_paper_ids = excluded.pinned_paper_ids,
                model = excluded.model,
                conversation_json = excluded.conversation_json,
                saved_artifacts_json = excluded.saved_artifacts_json,
                updated_at = excluded.updated_at"#,
        )
        .bind(&id)
        .bind(draft.project_id)
        .bind(title)
        .bind(pinned_paper_ids)
        .bind(draft.model)
        .bind(conversation_json)
        .bind(saved_artifacts_json)
        .bind(now)
        .bind(now)
        .execute(self.pool)
        .await?;
        self.get(&id).await?.context("saved Ask session missing")
    }

    pub async fn get(&self, id: &str) -> Result<Option<AskSession>> {
        sqlx::query("SELECT * FROM ask_sessions WHERE id = ?")
            .bind(id)
            .fetch_optional(self.pool)
            .await?
            .map(row_to_session)
            .transpose()
    }
}

fn row_to_session(row: sqlx::sqlite::SqliteRow) -> Result<AskSession> {
    Ok(AskSession {
        id: row.try_get("id")?,
        project_id: row.try_get("project_id")?,
        title: row.try_get("title")?,
        pinned_paper_ids: serde_json::from_str(&row.try_get::<String, _>("pinned_paper_ids")?)?,
        model: row.try_get("model")?,
        conversation: serde_json::from_str(&row.try_get::<String, _>("conversation_json")?)?,
        saved_artifacts: serde_json::from_str(&row.try_get::<String, _>("saved_artifacts_json")?)?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}

fn normalize_title(title: &str) -> String {
    let trimmed = title.trim();
    if trimmed.is_empty() {
        return "Untitled Ask session".into();
    }
    trimmed.chars().take(120).collect()
}

fn empty_array() -> Value {
    Value::Array(Vec::new())
}

#[cfg(test)]
mod tests {
    use super::normalize_title;

    #[test]
    fn normalizes_empty_title() {
        assert_eq!(normalize_title("   "), "Untitled Ask session");
    }
}
