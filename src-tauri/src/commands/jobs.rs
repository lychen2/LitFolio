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
    JobRepo::new(&state.pool)
        .create(&draft)
        .await
        .map_err(|e| e.to_string())
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
    JobRepo::new(&state.pool)
        .fail(&id, &error)
        .await
        .map_err(|e| e.to_string())
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
