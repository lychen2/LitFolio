//! Paper comparison IPC commands.

use std::sync::Arc;

use tauri::State;

use crate::storage::{ComparisonRepo, PaperComparison};
use crate::AppState;

#[tauri::command]
pub async fn paper_comparisons_list(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<PaperComparison>, String> {
    ComparisonRepo::new(&state.pool)
        .list_all()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_comparison_get(
    state: State<'_, Arc<AppState>>,
    id: i64,
) -> Result<Option<PaperComparison>, String> {
    ComparisonRepo::new(&state.pool)
        .get(id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_comparison_create(
    state: State<'_, Arc<AppState>>,
    paper_ids: Vec<String>,
    content: String,
    model: String,
) -> Result<i64, String> {
    ComparisonRepo::new(&state.pool)
        .insert(&paper_ids, &content, &model)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_comparison_update(
    state: State<'_, Arc<AppState>>,
    id: i64,
    content: String,
) -> Result<(), String> {
    ComparisonRepo::new(&state.pool)
        .update_content(id, &content)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_comparison_delete(
    state: State<'_, Arc<AppState>>,
    id: i64,
) -> Result<(), String> {
    ComparisonRepo::new(&state.pool)
        .delete(id)
        .await
        .map_err(|e| e.to_string())
}
