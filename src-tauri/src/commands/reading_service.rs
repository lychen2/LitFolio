//! Opens the canonical EasyRead surface for an existing LitFolio paper.

use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::reading_service::{ReadingService, ReadingSession};
use crate::AppState;

#[tauri::command]
pub async fn reading_service_open(
    app: AppHandle,
    service: State<'_, ReadingService>,
    state: State<'_, Arc<AppState>>,
    id: Option<String>,
) -> Result<ReadingSession, String> {
    service.open(&app, &state, id.as_deref()).await.map_err(|e| format!("{e:#}"))
}

#[tauri::command]
pub async fn reading_service_sync(
    service: State<'_, ReadingService>,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    service.sync_catalog(&state).await.map_err(|e| format!("{e:#}"))
}
