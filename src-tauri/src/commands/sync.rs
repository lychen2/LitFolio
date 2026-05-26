use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::library_sync::{
    configured_webdav, load_config, pull_library, push_library, save_config, test_connection,
    SyncConfig, SyncConnectionResult, SyncReport,
};
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
