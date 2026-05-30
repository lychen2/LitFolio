//! Smart collection IPC commands.

use std::sync::Arc;

use tauri::State;

use crate::storage::{FilterRule, Paper, SmartCollection, SmartCollectionRepo};
use crate::AppState;

#[tauri::command]
pub async fn smart_collections_list(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<SmartCollection>, String> {
    let repo = SmartCollectionRepo::new(&state.pool);
    repo.list().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn smart_collection_create(
    state: State<'_, Arc<AppState>>,
    name: String,
    rules: FilterRule,
) -> Result<i64, String> {
    let repo = SmartCollectionRepo::new(&state.pool);
    repo.create(&name, &rules).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn smart_collection_update(
    state: State<'_, Arc<AppState>>,
    id: i64,
    name: String,
    rules: FilterRule,
) -> Result<(), String> {
    let repo = SmartCollectionRepo::new(&state.pool);
    repo.update(id, &name, &rules)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn smart_collection_delete(
    state: State<'_, Arc<AppState>>,
    id: i64,
) -> Result<(), String> {
    let repo = SmartCollectionRepo::new(&state.pool);
    repo.delete(id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn smart_collection_query_papers(
    state: State<'_, Arc<AppState>>,
    id: i64,
) -> Result<Vec<Paper>, String> {
    let repo = SmartCollectionRepo::new(&state.pool);
    repo.query_papers(id).await.map_err(|e| e.to_string())
}
