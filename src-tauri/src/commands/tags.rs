//! Tag IPC commands.

use std::collections::HashMap;
use std::sync::Arc;

use tauri::State;

use crate::storage::{Tag, TagRepo, TagWithCount};
use crate::AppState;

#[tauri::command]
pub async fn tags_list(state: State<'_, Arc<AppState>>) -> Result<Vec<TagWithCount>, String> {
    TagRepo::new(&state.pool)
        .list()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn tag_create(
    state: State<'_, Arc<AppState>>,
    name: String,
    color: Option<String>,
) -> Result<Tag, String> {
    TagRepo::new(&state.pool)
        .create(&name, color.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn tag_rename(
    state: State<'_, Arc<AppState>>,
    id: i64,
    new_name: String,
) -> Result<(), String> {
    TagRepo::new(&state.pool)
        .rename(id, &new_name)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn tag_set_color(
    state: State<'_, Arc<AppState>>,
    id: i64,
    color: Option<String>,
) -> Result<(), String> {
    TagRepo::new(&state.pool)
        .set_color(id, color.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn tag_delete(state: State<'_, Arc<AppState>>, id: i64) -> Result<(), String> {
    TagRepo::new(&state.pool)
        .delete(id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_attach_tag(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    tag_id: i64,
) -> Result<(), String> {
    TagRepo::new(&state.pool)
        .attach(&paper_id, tag_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_detach_tag(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    tag_id: i64,
) -> Result<(), String> {
    TagRepo::new(&state.pool)
        .detach(&paper_id, tag_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_tags(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
) -> Result<Vec<Tag>, String> {
    TagRepo::new(&state.pool)
        .for_paper(&paper_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn papers_batch_tags(
    state: State<'_, Arc<AppState>>,
    paper_ids: Vec<String>,
) -> Result<HashMap<String, Vec<Tag>>, String> {
    TagRepo::new(&state.pool)
        .for_papers(&paper_ids)
        .await
        .map_err(|e| e.to_string())
}
