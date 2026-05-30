//! Duplicate detection IPC commands.

use std::sync::Arc;

use tauri::State;

use crate::storage::{dedup, DuplicatePair, Paper, PaperRepo};
use crate::AppState;

#[tauri::command]
pub async fn paper_find_duplicate(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
) -> Result<Option<Paper>, String> {
    let repo = PaperRepo::new(&state.pool);
    let paper = repo
        .get(&paper_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "paper not found".to_string())?;
    dedup::find_duplicate(&state.pool, &paper)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_scan_duplicates(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<DuplicatePair>, String> {
    dedup::scan_all_duplicates(&state.pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_merge(
    state: State<'_, Arc<AppState>>,
    keep_id: String,
    merge_id: String,
) -> Result<(), String> {
    dedup::merge_papers(&state.pool, &keep_id, &merge_id)
        .await
        .map_err(|e| e.to_string())
}
