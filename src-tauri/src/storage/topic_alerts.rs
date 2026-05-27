//! Topic alerts: periodic monitoring for new papers on a topic.

use anyhow::{Context, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::Row;

use super::db::Pool;

/// A topic alert definition.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopicAlert {
    pub id: i64,
    pub query: String,
    pub frequency: String, // "daily", "weekly", "on_launch"
    pub target_folder_id: Option<i64>,
    pub auto_import: bool,
    pub last_run_at: Option<i64>,
    pub created_at: i64,
}

/// A result stored by an alert run.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopicAlertResult {
    pub id: i64,
    pub alert_id: i64,
    pub paper_doi: Option<String>,
    pub paper_arxiv_id: Option<String>,
    pub title: String,
    pub authors: Option<String>,
    pub year: Option<i32>,
    pub abstract_text: Option<String>,
    pub seen: bool,
    pub added_at: i64,
}

pub struct TopicAlertRepo<'a> {
    pool: &'a Pool,
}

impl<'a> TopicAlertRepo<'a> {
    pub fn new(pool: &'a Pool) -> Self {
        Self { pool }
    }

    // ── Alert CRUD ─────────────────────────────────────────────────────

    pub async fn list(&self) -> Result<Vec<TopicAlert>> {
        let rows = sqlx::query(
            "SELECT id, query, frequency, target_folder_id, auto_import, last_run_at, created_at
             FROM topic_alerts ORDER BY created_at DESC",
        )
        .fetch_all(self.pool)
        .await
        .context("list topic alerts")?;

        Ok(rows.into_iter().map(|r| row_to_alert(&r)).collect())
    }

    pub async fn create(
        &self,
        query: &str,
        frequency: &str,
        target_folder_id: Option<i64>,
        auto_import: bool,
    ) -> Result<i64> {
        let now = Utc::now().timestamp();
        let id = sqlx::query(
            "INSERT INTO topic_alerts (query, frequency, target_folder_id, auto_import, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
        )
        .bind(query)
        .bind(frequency)
        .bind(target_folder_id)
        .bind(auto_import as i32)
        .bind(now)
        .execute(self.pool)
        .await
        .context("create topic alert")?
        .last_insert_rowid();
        Ok(id)
    }

    pub async fn delete(&self, id: i64) -> Result<()> {
        sqlx::query("DELETE FROM topic_alerts WHERE id = ?1")
            .bind(id)
            .execute(self.pool)
            .await
            .context("delete topic alert")?;
        Ok(())
    }

    pub async fn update_last_run(&self, id: i64) -> Result<()> {
        let now = Utc::now().timestamp();
        sqlx::query("UPDATE topic_alerts SET last_run_at = ?1 WHERE id = ?2")
            .bind(now)
            .bind(id)
            .execute(self.pool)
            .await
            .context("update alert last run")?;
        Ok(())
    }

    /// Get alerts that should run based on their frequency.
    pub async fn pending_alerts(&self) -> Result<Vec<TopicAlert>> {
        let now = Utc::now().timestamp();
        let rows = sqlx::query(
            "SELECT id, query, frequency, target_folder_id, auto_import, last_run_at, created_at
             FROM topic_alerts
             WHERE frequency = 'on_launch'
                OR (frequency = 'daily' AND (last_run_at IS NULL OR last_run_at < ?1 - 86400))
                OR (frequency = 'weekly' AND (last_run_at IS NULL OR last_run_at < ?1 - 604800))",
        )
        .bind(now)
        .fetch_all(self.pool)
        .await
        .context("get pending alerts")?;

        Ok(rows.into_iter().map(|r| row_to_alert(&r)).collect())
    }

    // ── Alert Results ──────────────────────────────────────────────────

    pub async fn add_result(
        &self,
        alert_id: i64,
        paper_doi: Option<&str>,
        paper_arxiv_id: Option<&str>,
        title: &str,
        authors: Option<&str>,
        year: Option<i32>,
        abstract_text: Option<&str>,
    ) -> Result<i64> {
        let now = Utc::now().timestamp();
        let id = sqlx::query(
            "INSERT INTO topic_alert_results
             (alert_id, paper_doi, paper_arxiv_id, title, authors, year, abstract_text, added_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        )
        .bind(alert_id)
        .bind(paper_doi)
        .bind(paper_arxiv_id)
        .bind(title)
        .bind(authors)
        .bind(year)
        .bind(abstract_text)
        .bind(now)
        .execute(self.pool)
        .await
        .context("add alert result")?
        .last_insert_rowid();
        Ok(id)
    }

    pub async fn list_results(&self, alert_id: i64, unseen_only: bool) -> Result<Vec<TopicAlertResult>> {
        let sql = if unseen_only {
            "SELECT id, alert_id, paper_doi, paper_arxiv_id, title, authors, year, abstract_text, seen, added_at
             FROM topic_alert_results WHERE alert_id = ?1 AND seen = 0 ORDER BY added_at DESC"
        } else {
            "SELECT id, alert_id, paper_doi, paper_arxiv_id, title, authors, year, abstract_text, seen, added_at
             FROM topic_alert_results WHERE alert_id = ?1 ORDER BY added_at DESC"
        };
        let rows = sqlx::query(sql)
            .bind(alert_id)
            .fetch_all(self.pool)
            .await
            .context("list alert results")?;

        Ok(rows.into_iter().map(|r| row_to_result(&r)).collect())
    }

    pub async fn mark_seen(&self, result_id: i64) -> Result<()> {
        sqlx::query("UPDATE topic_alert_results SET seen = 1 WHERE id = ?1")
            .bind(result_id)
            .execute(self.pool)
            .await
            .context("mark alert result seen")?;
        Ok(())
    }

    pub async fn mark_all_seen(&self, alert_id: i64) -> Result<()> {
        sqlx::query("UPDATE topic_alert_results SET seen = 1 WHERE alert_id = ?1")
            .bind(alert_id)
            .execute(self.pool)
            .await
            .context("mark all alert results seen")?;
        Ok(())
    }

    /// Count unseen results across all alerts.
    pub async fn unseen_count(&self) -> Result<i64> {
        let row = sqlx::query("SELECT COUNT(*) as cnt FROM topic_alert_results WHERE seen = 0")
            .fetch_one(self.pool)
            .await
            .context("count unseen alert results")?;
        Ok(row.try_get::<i64, _>("cnt").unwrap_or(0))
    }

    /// Check if a paper (by DOI or arXiv ID) already exists in any alert results.
    pub async fn result_exists(&self, doi: Option<&str>, arxiv_id: Option<&str>) -> Result<bool> {
        if let Some(d) = doi {
            let row = sqlx::query(
                "SELECT 1 FROM topic_alert_results WHERE paper_doi = ?1 LIMIT 1",
            )
            .bind(d)
            .fetch_optional(self.pool)
            .await
            .context("check result exists by doi")?;
            if row.is_some() {
                return Ok(true);
            }
        }
        if let Some(a) = arxiv_id {
            let row = sqlx::query(
                "SELECT 1 FROM topic_alert_results WHERE paper_arxiv_id = ?1 LIMIT 1",
            )
            .bind(a)
            .fetch_optional(self.pool)
            .await
            .context("check result exists by arxiv")?;
            if row.is_some() {
                return Ok(true);
            }
        }
        Ok(false)
    }
}

fn row_to_alert(r: &sqlx::sqlite::SqliteRow) -> TopicAlert {
    TopicAlert {
        id: r.try_get("id").unwrap_or(0),
        query: r.try_get("query").unwrap_or_default(),
        frequency: r.try_get("frequency").unwrap_or_default(),
        target_folder_id: r.try_get("target_folder_id").unwrap_or(None),
        auto_import: r.try_get::<i32, _>("auto_import").unwrap_or(0) != 0,
        last_run_at: r.try_get("last_run_at").unwrap_or(None),
        created_at: r.try_get("created_at").unwrap_or(0),
    }
}

fn row_to_result(r: &sqlx::sqlite::SqliteRow) -> TopicAlertResult {
    TopicAlertResult {
        id: r.try_get("id").unwrap_or(0),
        alert_id: r.try_get("alert_id").unwrap_or(0),
        paper_doi: r.try_get("paper_doi").unwrap_or(None),
        paper_arxiv_id: r.try_get("paper_arxiv_id").unwrap_or(None),
        title: r.try_get("title").unwrap_or_default(),
        authors: r.try_get("authors").unwrap_or(None),
        year: r.try_get("year").unwrap_or(None),
        abstract_text: r.try_get("abstract_text").unwrap_or(None),
        seen: r.try_get::<i32, _>("seen").unwrap_or(0) != 0,
        added_at: r.try_get("added_at").unwrap_or(0),
    }
}
