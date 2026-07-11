//! Reader highlight IPC commands.

use std::sync::Arc;

use tauri::State;

use crate::storage::{Highlight, HighlightRepo};
use crate::AppState;

#[tauri::command]
pub async fn highlight_create(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    page: i32,
    rect: serde_json::Value,
    text: String,
    color: Option<String>,
    label: Option<String>,
) -> Result<Highlight, String> {
    HighlightRepo::new(&state.pool)
        .insert(
            &paper_id,
            page,
            &rect,
            &text,
            color.as_deref(),
            label.as_deref(),
        )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn highlight_list(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
) -> Result<Vec<Highlight>, String> {
    HighlightRepo::new(&state.pool)
        .list_by_paper(&paper_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn highlight_update_note(
    state: State<'_, Arc<AppState>>,
    id: String,
    note: Option<String>,
) -> Result<(), String> {
    HighlightRepo::new(&state.pool)
        .update_note(&id, note.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn highlight_update_rect(
    state: State<'_, Arc<AppState>>,
    id: String,
    rect: serde_json::Value,
) -> Result<(), String> {
    HighlightRepo::new(&state.pool)
        .update_rect(&id, &rect)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn highlight_update_label(
    state: State<'_, Arc<AppState>>,
    id: String,
    label: Option<String>,
) -> Result<(), String> {
    HighlightRepo::new(&state.pool)
        .update_label(&id, label.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn highlight_delete(state: State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    HighlightRepo::new(&state.pool)
        .delete(&id)
        .await
        .map_err(|e| e.to_string())
}
