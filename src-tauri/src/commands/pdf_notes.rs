//! Reader PDF text-note IPC commands.

use std::sync::Arc;

use tauri::State;

use crate::storage::{
    PdfNote, PdfNoteCreateInput, PdfNoteError, PdfNotePatch, PdfNoteRepo, PdfNoteSearchResult,
};
use crate::AppState;

#[tauri::command]
pub async fn pdf_note_create(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    input: PdfNoteCreateInput,
) -> Result<PdfNote, PdfNoteError> {
    PdfNoteRepo::new(&state.pool)
        .create(&paper_id, &input)
        .await
}

#[tauri::command]
pub async fn pdf_note_list(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
) -> Result<Vec<PdfNote>, PdfNoteError> {
    PdfNoteRepo::new(&state.pool).list_by_paper(&paper_id).await
}

#[tauri::command]
pub async fn pdf_note_update(
    state: State<'_, Arc<AppState>>,
    id: String,
    patch: PdfNotePatch,
) -> Result<PdfNote, PdfNoteError> {
    PdfNoteRepo::new(&state.pool).update(&id, &patch).await
}

#[tauri::command]
pub async fn pdf_note_delete(
    state: State<'_, Arc<AppState>>,
    id: String,
    expected_revision: i64,
) -> Result<(), PdfNoteError> {
    PdfNoteRepo::new(&state.pool)
        .delete(&id, expected_revision)
        .await
}

#[tauri::command]
pub async fn pdf_note_search(
    state: State<'_, Arc<AppState>>,
    query: String,
    paper_id: Option<String>,
) -> Result<Vec<PdfNoteSearchResult>, PdfNoteError> {
    PdfNoteRepo::new(&state.pool)
        .search(&query, paper_id.as_deref())
        .await
}
