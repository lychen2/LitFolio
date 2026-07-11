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
    match test_connection(&state.http, &cfg).await {
        Ok(result) => {
            tracing::info!(
                remote_root = %result.remote_root,
                "library sync connection test succeeded"
            );
            Ok(result)
        }
        Err(error) => {
            let error = error.to_string();
            tracing::error!(error = %error, "library sync connection test failed");
            Err(error)
        }
    }
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
    match push_library(&state.http, &state.pool, &state.paths, &cfg).await {
        Ok(report) => {
            log_sync_report("push", &report);
            Ok(report)
        }
        Err(error) => {
            let error = error.to_string();
            tracing::error!(action = "push", error = %error, "library sync failed");
            Err(error)
        }
    }
}

#[tauri::command]
pub async fn sync_pull_library(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<SyncReport, String> {
    let _guard = state.sync_lock.lock().await;
    let cfg =
        configured_webdav(&load_config().map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    let report = match pull_library(&state.http, &state.pool, &state.paths, &cfg).await {
        Ok(report) => {
            log_sync_report("pull", &report);
            report
        }
        Err(error) => {
            let error = error.to_string();
            tracing::error!(action = "pull", error = %error, "library sync failed");
            return Err(error);
        }
    };
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
            tracing::info!(
                sync_job_id = %job.id,
                kind = kind,
                direction = direction,
                remote_root = %report.remote_root,
                manifest_version = report.manifest_version,
                manifest_file_count = report.manifest_file_count,
                manifest_total_bytes = report.manifest_total_bytes,
                add_count = report.add_count,
                update_count = report.update_count,
                delete_count = report.delete_count,
                unchanged_count = report.unchanged_count,
                transfer_bytes = report.transfer_bytes,
                restart_required = report.restart_required,
                backup_path = ?report.backup_path,
                "library sync preview completed"
            );
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
            tracing::error!(
                sync_job_id = %job.id,
                kind = kind,
                direction = direction,
                error = %error,
                "library sync preview failed"
            );
            job_repo
                .fail(&job.id, &error)
                .await
                .map_err(|e| e.to_string())?;
            Err(error)
        }
    }
}

fn log_sync_report(action: &str, report: &SyncReport) {
    tracing::info!(
        action = action,
        remote_root = %report.remote_root,
        manifest_version = report.manifest_version,
        manifest_file_count = report.manifest_file_count,
        manifest_total_bytes = report.manifest_total_bytes,
        file_count = report.file_count,
        total_bytes = report.total_bytes,
        skipped_count = report.skipped_count,
        skipped_bytes = report.skipped_bytes,
        restart_required = report.restart_required,
        "library sync completed"
    );
}
