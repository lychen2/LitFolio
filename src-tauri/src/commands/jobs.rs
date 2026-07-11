//! Generic persisted job lifecycle IPC commands.

use std::sync::Arc;

use tauri::State;

use crate::storage::{JobDraft, JobProgress, JobRecord, JobRepo};
use crate::AppState;

#[tauri::command]
pub async fn jobs_list(
    state: State<'_, Arc<AppState>>,
    status: Option<String>,
    limit: Option<i64>,
) -> Result<Vec<JobRecord>, String> {
    JobRepo::new(&state.pool)
        .list(status.as_deref(), limit.unwrap_or(100))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn job_create(
    state: State<'_, Arc<AppState>>,
    draft: JobDraft,
) -> Result<JobRecord, String> {
    let job = JobRepo::new(&state.pool)
        .create(&draft)
        .await
        .map_err(|e| e.to_string())?;
    log_import_job_created(&job);
    Ok(job)
}

#[tauri::command]
pub async fn job_start(state: State<'_, Arc<AppState>>, id: String) -> Result<JobRecord, String> {
    JobRepo::new(&state.pool)
        .start(&id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn job_update_progress(
    state: State<'_, Arc<AppState>>,
    id: String,
    current: i64,
    total: i64,
) -> Result<JobRecord, String> {
    JobRepo::new(&state.pool)
        .update_progress(&id, JobProgress { current, total })
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn job_succeed(state: State<'_, Arc<AppState>>, id: String) -> Result<JobRecord, String> {
    JobRepo::new(&state.pool)
        .succeed(&id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn job_fail(
    state: State<'_, Arc<AppState>>,
    id: String,
    error: String,
) -> Result<JobRecord, String> {
    let job = JobRepo::new(&state.pool)
        .fail(&id, &error)
        .await
        .map_err(|e| e.to_string())?;
    log_import_job_failed(&job, &error);
    Ok(job)
}

#[tauri::command]
pub async fn job_cancel(state: State<'_, Arc<AppState>>, id: String) -> Result<JobRecord, String> {
    JobRepo::new(&state.pool)
        .cancel(&id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn job_retry(state: State<'_, Arc<AppState>>, id: String) -> Result<JobRecord, String> {
    JobRepo::new(&state.pool)
        .retry(&id)
        .await
        .map_err(|e| e.to_string())
}

fn log_import_job_created(job: &JobRecord) {
    if !is_import_job(job) {
        return;
    }
    tracing::info!(
        job_id = %job.id,
        job_kind = %job.kind,
        import_source = %import_source(job),
        scope = job.scope.as_deref().unwrap_or(""),
        "import job created"
    );
}

fn log_import_job_failed(job: &JobRecord, failure_reason: &str) {
    if !is_import_job(job) {
        return;
    }
    tracing::warn!(
        job_id = %job.id,
        job_kind = %job.kind,
        import_source = %import_source(job),
        scope = job.scope.as_deref().unwrap_or(""),
        failure_reason,
        "import job failed"
    );
}

fn is_import_job(job: &JobRecord) -> bool {
    job.kind.contains("import")
}

fn import_source(job: &JobRecord) -> String {
    job.details
        .get("source")
        .and_then(|value| value.as_str())
        .filter(|value| !value.trim().is_empty())
        .map(str::to_string)
        .or_else(|| job.scope.clone())
        .unwrap_or_else(|| job.kind.clone())
}
