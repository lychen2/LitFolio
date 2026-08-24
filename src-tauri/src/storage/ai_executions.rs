//! Core-owned, redacted AI execution records.
//!
//! Every AI dispatch writes one `running` row and exactly one terminal
//! transition (`succeeded` | `failed` | `cancelled`). Rows never contain
//! secrets, raw provider payloads, or full private document excerpts — only
//! operation metadata, model/profile names, timing, and a short error category.

use super::Pool;

pub type Result<T> = std::result::Result<T, sqlx::Error>;

#[derive(Debug, Clone, PartialEq, sqlx::FromRow, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionRecord {
    pub id: String,
    pub operation: String,
    pub trigger: String,
    pub envelope_id: String,
    pub paper_id: Option<String>,
    pub profile_name: String,
    pub model: String,
    pub state: String,
    pub started_at: i64,
    pub finished_at: Option<i64>,
    pub duration_ms: Option<i64>,
    pub error_summary: Option<String>,
}

pub struct AiExecutionRepo<'a> {
    pool: &'a Pool,
}

impl<'a> AiExecutionRepo<'a> {
    pub fn new(pool: &'a Pool) -> Self {
        Self { pool }
    }

    /// Insert the initial `running` record for a dispatch.
    pub async fn record_start(&self, record: &ExecutionRecord) -> Result<()> {
        sqlx::query(
            "INSERT INTO ai_execution_records \
             (id, operation, trigger, envelope_id, paper_id, profile_name, model, state, started_at) \
             VALUES (?, ?, ?, ?, ?, ?, ?, 'running', ?)",
        )
        .bind(&record.id)
        .bind(&record.operation)
        .bind(&record.trigger)
        .bind(&record.envelope_id)
        .bind(&record.paper_id)
        .bind(&record.profile_name)
        .bind(&record.model)
        .bind(record.started_at)
        .execute(self.pool)
        .await?;
        Ok(())
    }

    /// Transition to a terminal state. Exactly-once: once terminal, the state,
    /// finish time, and error summary are frozen; later transitions are ignored
    /// so late completions after cancellation cannot rewrite history.
    pub async fn record_terminal(
        &self,
        id: &str,
        state: &str,
        error_summary: Option<&str>,
        now_ms: i64,
    ) -> Result<()> {
        sqlx::query(
            "UPDATE ai_execution_records \
             SET state = ?, finished_at = ?, duration_ms = ? - started_at, error_summary = ? \
             WHERE id = ? AND state = 'running'",
        )
        .bind(state)
        .bind(now_ms)
        .bind(now_ms)
        .bind(error_summary)
        .bind(id)
        .execute(self.pool)
        .await?;
        Ok(())
    }

    pub async fn get(&self, id: &str) -> Result<Option<ExecutionRecord>> {
        let record = sqlx::query_as(
            "SELECT id, operation, trigger, envelope_id, paper_id, profile_name, model, state, \
             started_at, finished_at, duration_ms, error_summary \
             FROM ai_execution_records WHERE id = ?",
        )
        .bind(id)
        .fetch_optional(self.pool)
        .await?;
        Ok(record)
    }

    pub async fn list_for_paper(&self, paper_id: &str, limit: i64) -> Result<Vec<ExecutionRecord>> {
        let records = sqlx::query_as(
            "SELECT id, operation, trigger, envelope_id, paper_id, profile_name, model, state, \
             started_at, finished_at, duration_ms, error_summary \
             FROM ai_execution_records WHERE paper_id = ? ORDER BY started_at DESC LIMIT ?",
        )
        .bind(paper_id)
        .bind(limit)
        .fetch_all(self.pool)
        .await?;
        Ok(records)
    }

    /// Live dispatches that can still be cancelled.
    pub async fn list_running(&self) -> Result<Vec<ExecutionRecord>> {
        let records = sqlx::query_as(
            "SELECT id, operation, trigger, envelope_id, paper_id, profile_name, model, state, \
             started_at, finished_at, duration_ms, error_summary \
             FROM ai_execution_records WHERE state = 'running' ORDER BY started_at DESC",
        )
        .fetch_all(self.pool)
        .await?;
        Ok(records)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::run_migrations;

    fn sample(id: &str) -> ExecutionRecord {
        ExecutionRecord {
            id: id.to_string(),
            operation: "paper_tldr".into(),
            trigger: "user-action".into(),
            envelope_id: format!("env-{id}"),
            paper_id: Some("p1".into()),
            profile_name: "main".into(),
            model: "gpt-test".into(),
            state: "running".into(),
            started_at: 1_000,
            finished_at: None,
            duration_ms: None,
            error_summary: None,
        }
    }

    #[sqlx::test]
    async fn terminal_transition_is_exactly_once(pool: Pool) {
        run_migrations(&pool).await.expect("migrations run");
        let repo = AiExecutionRepo::new(&pool);
        repo.record_start(&sample("e1")).await.unwrap();

        repo.record_terminal("e1", "cancelled", Some("user-cancelled"), 1_500)
            .await
            .unwrap();
        // A late completion must not overwrite the terminal record.
        repo.record_terminal("e1", "succeeded", None, 1_900)
            .await
            .unwrap();

        let row = repo.get("e1").await.unwrap().expect("row exists");
        assert_eq!(row.state, "cancelled");
        assert_eq!(row.duration_ms, Some(500));
        assert_eq!(row.error_summary.as_deref(), Some("user-cancelled"));
    }

    #[sqlx::test]
    async fn list_filters_by_paper(pool: Pool) {
        run_migrations(&pool).await.expect("migrations run");
        let repo = AiExecutionRepo::new(&pool);
        repo.record_start(&sample("e1")).await.unwrap();
        let mut other = sample("e2");
        other.paper_id = Some("p2".into());
        repo.record_start(&other).await.unwrap();
        assert_eq!(repo.list_for_paper("p1", 10).await.unwrap().len(), 1);
    }
}
