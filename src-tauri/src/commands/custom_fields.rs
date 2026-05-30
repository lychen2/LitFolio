//! Custom field IPC commands.

use std::sync::Arc;

use tauri::State;

use crate::storage::{CustomFieldDef, CustomFieldRepo, PaperCustomField};
use crate::AppState;

#[tauri::command]
pub async fn custom_field_defs_list(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<CustomFieldDef>, String> {
    let repo = CustomFieldRepo::new(&state.pool);
    repo.list_defs().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn custom_field_def_create(
    state: State<'_, Arc<AppState>>,
    name: String,
    field_type: String,
    options: Option<Vec<String>>,
) -> Result<i64, String> {
    let repo = CustomFieldRepo::new(&state.pool);
    let opts = options.as_deref();
    repo.create_def(&name, &field_type, opts)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn custom_field_def_delete(
    state: State<'_, Arc<AppState>>,
    id: i64,
) -> Result<(), String> {
    let repo = CustomFieldRepo::new(&state.pool);
    repo.delete_def(id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_custom_fields_get(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
) -> Result<Vec<PaperCustomField>, String> {
    let repo = CustomFieldRepo::new(&state.pool);
    repo.get_paper_fields(&paper_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_custom_field_set(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    field_id: i64,
    value: String,
) -> Result<(), String> {
    let repo = CustomFieldRepo::new(&state.pool);
    repo.set_paper_field(&paper_id, field_id, &value)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_custom_field_delete(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    field_id: i64,
) -> Result<(), String> {
    let repo = CustomFieldRepo::new(&state.pool);
    repo.delete_paper_field(&paper_id, field_id)
        .await
        .map_err(|e| e.to_string())
}
