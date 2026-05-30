//! Reading queue IPC commands.

use std::sync::Arc;

use tauri::State;

use crate::storage::{QueueEntry, QueueRepo};
use crate::AppState;

#[tauri::command]
pub async fn queue_list(state: State<'_, Arc<AppState>>) -> Result<Vec<QueueEntry>, String> {
    QueueRepo::new(&state.pool)
        .list()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn queue_add(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    priority: Option<i32>,
    target_date: Option<i64>,
    note: Option<String>,
) -> Result<(), String> {
    QueueRepo::new(&state.pool)
        .add(
            &paper_id,
            priority.unwrap_or(0),
            target_date,
            note.as_deref(),
        )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn queue_remove(state: State<'_, Arc<AppState>>, paper_id: String) -> Result<(), String> {
    QueueRepo::new(&state.pool)
        .remove(&paper_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn queue_update(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    priority: i32,
    target_date: Option<i64>,
    note: Option<String>,
) -> Result<(), String> {
    QueueRepo::new(&state.pool)
        .update(&paper_id, priority, target_date, note.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn queue_reorder(
    state: State<'_, Arc<AppState>>,
    paper_ids: Vec<String>,
) -> Result<(), String> {
    QueueRepo::new(&state.pool)
        .reorder(&paper_ids)
        .await
        .map_err(|e| e.to_string())
}
