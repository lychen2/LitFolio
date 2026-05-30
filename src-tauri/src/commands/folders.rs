//! Folder IPC commands.

use std::sync::Arc;
use tauri::State;

use crate::storage::{Folder, FolderRepo, FolderWithCount};
use crate::AppState;

#[tauri::command]
pub async fn folders_list(state: State<'_, Arc<AppState>>) -> Result<Vec<FolderWithCount>, String> {
    FolderRepo::new(&state.pool)
        .list()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn folder_create(
    state: State<'_, Arc<AppState>>,
    name: String,
    parent_id: Option<i64>,
) -> Result<Folder, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("folder name must not be empty".into());
    }
    FolderRepo::new(&state.pool)
        .create(trimmed, parent_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn folder_rename(
    state: State<'_, Arc<AppState>>,
    id: i64,
    name: String,
) -> Result<(), String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("folder name must not be empty".into());
    }
    FolderRepo::new(&state.pool)
        .rename(id, trimmed)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn folder_delete(state: State<'_, Arc<AppState>>, id: i64) -> Result<(), String> {
    FolderRepo::new(&state.pool)
        .delete(id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_attach_folder(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    folder_id: i64,
) -> Result<(), String> {
    FolderRepo::new(&state.pool)
        .attach(&paper_id, folder_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_detach_folder(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    folder_id: i64,
) -> Result<(), String> {
    FolderRepo::new(&state.pool)
        .detach(&paper_id, folder_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_folders(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
) -> Result<Vec<Folder>, String> {
    FolderRepo::new(&state.pool)
        .for_paper(&paper_id)
        .await
        .map_err(|e| e.to_string())
}
