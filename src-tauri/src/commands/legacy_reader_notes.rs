//! Targeted legacy margin-note conversion commands.
//!
//! These are explicit, user-triggered actions; no startup orchestration
//! happens here (`mono-legacy-conversion` owns whole-library conversion).

use std::sync::Arc;

use tauri::State;

use crate::storage::{
    export_legacy_reader_notes, preview_legacy_reader_notes, LegacyReaderNotesError,
    LegacyReaderNotesPreview, LegacyReaderNotesReport,
};
use crate::AppState;

#[tauri::command]
pub async fn legacy_reader_notes_preview(
    state: State<'_, Arc<AppState>>,
) -> Result<LegacyReaderNotesPreview, LegacyReaderNotesError> {
    preview_legacy_reader_notes(&state.pool).await
}

#[tauri::command]
pub async fn legacy_reader_notes_export(
    state: State<'_, Arc<AppState>>,
    destination: Option<String>,
) -> Result<LegacyReaderNotesReport, LegacyReaderNotesError> {
    export_legacy_reader_notes(
        &state.pool,
        &state.paths,
        destination.as_deref().map(std::path::Path::new),
    )
    .await
}
