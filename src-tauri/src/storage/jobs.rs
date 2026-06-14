//! Persisted lifecycle records for long-running frontend-visible jobs.

use anyhow::{bail, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::Row;

use super::db::Pool;

pub const STATUS_QUEUED: &str = "queued";
pub const STATUS_RUNNING: &str = "running";
pub const STATUS_SUCCEEDED: &str = "succeeded";
pub const STATUS_FAILED: &str = "failed";
pub const STATUS_CANCELLED: &str = "cancelled";

const TERMINAL_STATUSES: &[&str] = &[STATUS_SUCCEEDED, STATUS_FAILED, STATUS_CANCELLED];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobRecord {
    pub id: String,
    pub kind: String,
    pub scope: Option<String>,
    pub title: String,
    pub status: String,
    pub details: serde_json::Value,
    pub progress_current: i64,
    pub progress_total: i64,
    pub error: Option<String>,
    pub attempts: i64,
    pub max_attempts: i64,
    pub created_at: i64,
    pub updated_at: i64,
    pub started_at: Option<i64>,
    pub finished_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobDraft {
    pub kind: String,
    pub scope: Option<String>,
    pub title: String,
    #[serde(default)]
    pub details: serde_json::Value,
    pub max_attempts: Option<i64>,
}

#[derive(Debug, Clone, Copy)]
pub struct JobProgress {
    pub current: i64,
    pub total: i64,
}

pub struct JobRepo<'a> {
    pool: &'a Pool,
}

impl<'a> JobRepo<'a> {
    pub fn new(pool: &'a Pool) -> Self {
        Self { pool }
    }

    pub async fn create(&self, draft: &JobDraft) -> Result<JobRecord> {
        validate_non_empty("job kind", &draft.kind)?;
        validate_non_empty("job title", &draft.title)?;
        let now = Utc::now().timestamp();
        let id = format!("job_{}", ulid::Ulid::new());
        let details_json = serde_json::to_string(&draft.details)?;
        let max_attempts = draft.max_attempts.unwrap_or(1).max(1);
        let row = sqlx::query(
            "INSERT INTO jobs
             (id, kind, scope, title, status, details_json, max_attempts, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, 'queued', ?5, ?6, ?7, ?7)
             RETURNING *",
        )
        .bind(id)
        .bind(draft.kind.trim())
        .bind(trimmed_optional(draft.scope.as_deref()))
        .bind(draft.title.trim())
        .bind(details_json)
        .bind(max_attempts)
        .bind(now)
        .fetch_one(self.pool)
        .await?;
        row_to_job(row)
    }

    pub async fn list(&self, status: Option<&str>, limit: i64) -> Result<Vec<JobRecord>> {
        let limit = limit.clamp(1, 200);
        let rows = if let Some(status) = trimmed_optional(status) {
            validate_status(&status)?;
            sqlx::query("SELECT * FROM jobs WHERE status = ?1 ORDER BY updated_at DESC LIMIT ?2")
                .bind(status)
                .bind(limit)
                .fetch_all(self.pool)
                .await?
        } else {
            sqlx::query("SELECT * FROM jobs ORDER BY updated_at DESC LIMIT ?1")
                .bind(limit)
                .fetch_all(self.pool)
                .await?
        };
        rows.into_iter().map(row_to_job).collect()
    }

    pub async fn get(&self, id: &str) -> Result<Option<JobRecord>> {
        let Some(row) = sqlx::query("SELECT * FROM jobs WHERE id = ?1")
            .bind(id)
            .fetch_optional(self.pool)
            .await?
        else {
            return Ok(None);
        };
        row_to_job(row).map(Some)
    }

    pub async fn start(&self, id: &str) -> Result<JobRecord> {
        self.transition(id, STATUS_RUNNING, None, None).await
    }

    pub async fn update_progress(&self, id: &str, progress: JobProgress) -> Result<JobRecord> {
        if progress.current < 0 || progress.total < 0 {
            bail!("job progress cannot be negative");
        }
        let now = Utc::now().timestamp();
        let row = sqlx::query(
            "UPDATE jobs
             SET progress_current = ?1, progress_total = ?2, updated_at = ?3
             WHERE id = ?4
             RETURNING *",
        )
        .bind(progress.current)
        .bind(progress.total)
        .bind(now)
        .bind(id)
        .fetch_one(self.pool)
        .await?;
        row_to_job(row)
    }

    pub async fn succeed(&self, id: &str) -> Result<JobRecord> {
        self.transition(id, STATUS_SUCCEEDED, None, None).await
    }

    pub async fn fail(&self, id: &str, error: &str) -> Result<JobRecord> {
        self.transition(id, STATUS_FAILED, Some(error), None).await
    }

    pub async fn cancel(&self, id: &str) -> Result<JobRecord> {
        let job = self.require(id).await?;
        if TERMINAL_STATUSES.contains(&job.status.as_str()) {
            return Ok(job);
        }
        self.transition(id, STATUS_CANCELLED, Some("cancelled by user"), None)
            .await
    }

    pub async fn retry(&self, id: &str) -> Result<JobRecord> {
        let job = self.require(id).await?;
        if job.status != STATUS_FAILED && job.status != STATUS_CANCELLED {
            bail!("only failed or cancelled jobs can be retried");
        }
        if job.attempts >= job.max_attempts {
            bail!("job retry limit reached");
        }
        let now = Utc::now().timestamp();
        let row = sqlx::query(
            "UPDATE jobs
             SET status = 'queued', attempts = attempts + 1, error = NULL,
                 progress_current = 0, progress_total = 0,
                 updated_at = ?1, started_at = NULL, finished_at = NULL
             WHERE id = ?2
             RETURNING *",
        )
        .bind(now)
        .bind(id)
        .fetch_one(self.pool)
        .await?;
        row_to_job(row)
    }

    async fn transition(
        &self,
        id: &str,
        status: &str,
        error: Option<&str>,
        progress: Option<JobProgress>,
    ) -> Result<JobRecord> {
        validate_status(status)?;
        let now = Utc::now().timestamp();
        let started_at = if status == STATUS_RUNNING {
            Some(now)
        } else {
            None
        };
        let finished_at = if TERMINAL_STATUSES.contains(&status) {
            Some(now)
        } else {
            None
        };
        let progress_current = progress.map(|p| p.current);
        let progress_total = progress.map(|p| p.total);
        let row = sqlx::query(
            "UPDATE jobs
             SET status = ?1,
                 error = ?2,
                 updated_at = ?3,
                 started_at = COALESCE(?4, started_at),
                 finished_at = ?5,
                 progress_current = COALESCE(?6, progress_current),
                 progress_total = COALESCE(?7, progress_total)
             WHERE id = ?8
             RETURNING *",
        )
        .bind(status)
        .bind(error)
        .bind(now)
        .bind(started_at)
        .bind(finished_at)
        .bind(progress_current)
        .bind(progress_total)
        .bind(id)
        .fetch_one(self.pool)
        .await?;
        row_to_job(row)
    }

    async fn require(&self, id: &str) -> Result<JobRecord> {
        self.get(id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("job not found: {id}"))
    }
}

fn row_to_job(row: sqlx::sqlite::SqliteRow) -> Result<JobRecord> {
    let details_json: String = row.try_get("details_json")?;
    Ok(JobRecord {
        id: row.try_get("id")?,
        kind: row.try_get("kind")?,
        scope: row.try_get("scope")?,
        title: row.try_get("title")?,
        status: row.try_get("status")?,
        details: serde_json::from_str(&details_json).unwrap_or_else(|_| serde_json::json!({})),
        progress_current: row.try_get("progress_current")?,
        progress_total: row.try_get("progress_total")?,
        error: row.try_get("error")?,
        attempts: row.try_get("attempts")?,
        max_attempts: row.try_get("max_attempts")?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
        started_at: row.try_get("started_at")?,
        finished_at: row.try_get("finished_at")?,
    })
}

fn validate_non_empty(label: &str, value: &str) -> Result<()> {
    if value.trim().is_empty() {
        bail!("{label} is required");
    }
    Ok(())
}

fn validate_status(status: &str) -> Result<()> {
    match status {
        STATUS_QUEUED | STATUS_RUNNING | STATUS_SUCCEEDED | STATUS_FAILED | STATUS_CANCELLED => {
            Ok(())
        }
        _ => bail!("invalid job status: {status}"),
    }
}

fn trimmed_optional(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::db::run_migrations;
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
    use std::str::FromStr;

    async fn mem_pool() -> Pool {
        let opts = SqliteConnectOptions::from_str("sqlite::memory:")
            .unwrap()
            .foreign_keys(true);
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(opts)
            .await
            .unwrap();
        run_migrations(&pool).await.unwrap();
        pool
    }

    fn draft() -> JobDraft {
        JobDraft {
            kind: "folder_import".into(),
            scope: Some("/tmp/papers".into()),
            title: "Import folder".into(),
            details: serde_json::json!({ "path": "/tmp/papers" }),
            max_attempts: Some(2),
        }
    }

    #[tokio::test]
    async fn job_lifecycle_persists_status_progress_and_retry() {
        let pool = mem_pool().await;
        let repo = JobRepo::new(&pool);

        let created = repo.create(&draft()).await.unwrap();
        assert_eq!(created.status, STATUS_QUEUED);
        assert_eq!(created.attempts, 0);

        let running = repo.start(&created.id).await.unwrap();
        assert_eq!(running.status, STATUS_RUNNING);
        assert!(running.started_at.is_some());

        let progressed = repo
            .update_progress(
                &created.id,
                JobProgress {
                    current: 1,
                    total: 3,
                },
            )
            .await
            .unwrap();
        assert_eq!(progressed.progress_current, 1);
        assert_eq!(progressed.progress_total, 3);

        let failed = repo.fail(&created.id, "network unavailable").await.unwrap();
        assert_eq!(failed.status, STATUS_FAILED);
        assert_eq!(failed.error.as_deref(), Some("network unavailable"));
        assert!(failed.finished_at.is_some());

        let retried = repo.retry(&created.id).await.unwrap();
        assert_eq!(retried.status, STATUS_QUEUED);
        assert_eq!(retried.attempts, 1);
        assert_eq!(retried.error, None);
        assert_eq!(retried.progress_current, 0);
    }

    #[tokio::test]
    async fn cancel_is_idempotent_for_terminal_jobs() {
        let pool = mem_pool().await;
        let repo = JobRepo::new(&pool);
        let created = repo.create(&draft()).await.unwrap();

        let cancelled = repo.cancel(&created.id).await.unwrap();
        assert_eq!(cancelled.status, STATUS_CANCELLED);

        let cancelled_again = repo.cancel(&created.id).await.unwrap();
        assert_eq!(cancelled_again.status, STATUS_CANCELLED);
    }
}
