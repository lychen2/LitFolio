//! Reader note IPC commands.

use std::sync::Arc;

use tauri::State;

use crate::storage::{
    notes, NoteSaveResult, NoteSection, NoteSectionRepo, ProvenanceError, ProvenanceRepo,
};
use crate::AppState;

#[tauri::command]
pub async fn note_sections_get(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
) -> Result<Vec<NoteSection>, String> {
    let repo = NoteSectionRepo::new(&state.pool);
    repo.ensure_defaults(&paper_id)
        .await
        .map_err(|e| e.to_string())?;
    repo.list_by_paper(&paper_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn note_sections_save(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    section_key: String,
    content: String,
    source: Option<String>,
) -> Result<(), String> {
    NoteSectionRepo::new(&state.pool)
        .save(
            &paper_id,
            &section_key,
            &content,
            &source.unwrap_or_else(|| "user".into()),
        )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn note_sections_reorder(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    section_ids: Vec<i64>,
) -> Result<(), String> {
    NoteSectionRepo::new(&state.pool)
        .reorder(&paper_id, &section_ids)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn note_section_delete(state: State<'_, Arc<AppState>>, id: i64) -> Result<(), String> {
    NoteSectionRepo::new(&state.pool)
        .delete(id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn note_get(state: State<'_, Arc<AppState>>, paper_id: String) -> Result<String, String> {
    notes::read(&state.paths, &paper_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn note_save(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    content: String,
    expected_revision: Option<i64>,
) -> Result<NoteSaveResult, ProvenanceError> {
    ProvenanceRepo::new(&state.pool)
        .note_save(&state.paths, &paper_id, &content, expected_revision)
        .await
}
