//! Shared plumbing for core AI Reading dispatches.
//!
//! Every user-triggered core AI action goes through
//! [`run_reading_dispatch`]: open a redacted execution record, register a real
//! cancellation token, race provider I/O against cancellation, close the
//! record exactly once at a terminal state, and drop the token registration.
//! Cancelled or revoked dispatches never persist results.

use std::future::Future;

use tokio_util::sync::CancellationToken;

use crate::ai::{dispatch_with_cancel, ReadingContextEnvelope};
use crate::storage::{AiExecutionRepo, ExecutionRecord};
use crate::AppState;

pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or_default()
}

/// Bounded, single-line error summary for execution records. Provider errors
/// can embed response fragments; records never store them verbatim.
pub fn redact_error(err: &str) -> String {
    let line = err.lines().next().unwrap_or_default();
    line.chars().take(160).collect()
}

/// Run one core AI Reading dispatch end to end. Returns `Err("cancelled")`
/// when the token fired first; late results cannot resurface.
pub(crate) async fn run_reading_dispatch<T>(
    state: &AppState,
    operation: &str,
    paper_id: &str,
    profile_name: &str,
    model: &str,
    envelope: &ReadingContextEnvelope,
    io: impl Future<Output = anyhow::Result<T>>,
) -> Result<T, String> {
    let executions = AiExecutionRepo::new(&state.pool);
    let exec_id = format!("exec-{}-{}-{}", operation, paper_id, now_ms());
    let started = now_ms();
    let _ = executions
        .record_start(&ExecutionRecord {
            id: exec_id.clone(),
            operation: operation.to_string(),
            trigger: "user-action".to_string(),
            envelope_id: envelope.envelope_id.clone(),
            paper_id: Some(paper_id.to_string()),
            profile_name: profile_name.to_string(),
            model: model.to_string(),
            state: "running".to_string(),
            started_at: started,
            finished_at: None,
            duration_ms: None,
            error_summary: None,
        })
        .await;

    let token = CancellationToken::new();
    state
        .ai_cancels
        .lock()
        .await
        .insert(exec_id.clone(), token.clone());

    let outcome = dispatch_with_cancel(&token, io).await;

    state.ai_cancels.lock().await.remove(&exec_id);
    match outcome {
        Some(Ok(value)) => {
            let _ = executions
                .record_terminal(&exec_id, "succeeded", None, now_ms())
                .await;
            Ok(value)
        }
        Some(Err(err)) => {
            let summary = redact_error(&err.to_string());
            let _ = executions
                .record_terminal(&exec_id, "failed", Some(&summary), now_ms())
                .await;
            Err(summary)
        }
        None => {
            let _ = executions
                .record_terminal(&exec_id, "cancelled", Some("user-cancelled"), now_ms())
                .await;
            Err("cancelled".to_string())
        }
    }
}
