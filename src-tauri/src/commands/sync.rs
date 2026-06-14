use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::library_sync::{
    configured_webdav, load_config, preview_pull_library, preview_push_library, pull_library,
    push_library, save_config, test_connection, SyncConfig, SyncConnectionResult,
    SyncPreviewReport, SyncReport,
};
use crate::storage::{JobDraft, JobProgress, JobRepo};
use crate::AppState;

#[tauri::command]
pub fn sync_get_config() -> Result<SyncConfig, String> {
    load_config().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn sync_save_config(config: SyncConfig) -> Result<(), String> {
    save_config(&config).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn sync_test(state: State<'_, Arc<AppState>>) -> Result<SyncConnectionResult, String> {
    let _guard = state.sync_lock.lock().await;
    let cfg =
        configured_webdav(&load_config().map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    test_connection(&state.http, &cfg)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn sync_preview_push_library(
    state: State<'_, Arc<AppState>>,
) -> Result<SyncPreviewReport, String> {
    let _guard = state.sync_lock.lock().await;
    run_sync_preview_job(&state, "sync_preview_push", "push", || async {
        let cfg = configured_webdav(&load_config().map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        preview_push_library(&state.http, &state.pool, &state.paths, &cfg)
            .await
            .map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn sync_preview_pull_library(
    state: State<'_, Arc<AppState>>,
) -> Result<SyncPreviewReport, String> {
    let _guard = state.sync_lock.lock().await;
    run_sync_preview_job(&state, "sync_preview_pull", "pull", || async {
        let cfg = configured_webdav(&load_config().map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        preview_pull_library(&state.http, &state.pool, &state.paths, &cfg)
            .await
            .map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn sync_push_library(state: State<'_, Arc<AppState>>) -> Result<SyncReport, String> {
    let _guard = state.sync_lock.lock().await;
    let cfg =
        configured_webdav(&load_config().map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    push_library(&state.http, &state.pool, &state.paths, &cfg)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn sync_pull_library(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<SyncReport, String> {
    let _guard = state.sync_lock.lock().await;
    let cfg =
        configured_webdav(&load_config().map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    let report = pull_library(&state.http, &state.pool, &state.paths, &cfg)
        .await
        .map_err(|e| e.to_string())?;
    app.request_restart();
    Ok(report)
}

async fn run_sync_preview_job<F, Fut>(
    state: &AppState,
    kind: &str,
    direction: &str,
    run: F,
) -> Result<SyncPreviewReport, String>
where
    F: FnOnce() -> Fut,
    Fut: std::future::Future<Output = Result<SyncPreviewReport, String>>,
{
    let job_repo = JobRepo::new(&state.pool);
    let job = job_repo
        .create(&JobDraft {
            kind: kind.into(),
            scope: Some(direction.into()),
            title: format!("Preview library sync ({direction})"),
            details: serde_json::json!({ "direction": direction }),
            max_attempts: Some(1),
        })
        .await
        .map_err(|e| e.to_string())?;
    job_repo.start(&job.id).await.map_err(|e| e.to_string())?;
    job_repo
        .update_progress(
            &job.id,
            JobProgress {
                current: 0,
                total: 1,
            },
        )
        .await
        .map_err(|e| e.to_string())?;

    match run().await {
        Ok(report) => {
            job_repo
                .update_progress(
                    &job.id,
                    JobProgress {
                        current: 1,
                        total: 1,
                    },
                )
                .await
                .map_err(|e| e.to_string())?;
            job_repo.succeed(&job.id).await.map_err(|e| e.to_string())?;
            Ok(report)
        }
        Err(error) => {
            job_repo
                .fail(&job.id, &error)
                .await
                .map_err(|e| e.to_string())?;
            Err(error)
        }
    }
}
