use std::sync::Arc;

use tauri::{AppHandle, State};

use super::common::PdfImportSummary;
use crate::reading_service::ReadingService;
use crate::AppState;

/// System file selection and window drops use the canonical upstream import.
#[tauri::command]
pub async fn import_pdf_files(
    app: AppHandle,
    service: State<'_, ReadingService>,
    state: State<'_, Arc<AppState>>,
    paths: Vec<String>,
) -> Result<PdfImportSummary, String> {
    service.import_files(&app, &state, paths).await.map_err(|e| format!("{e:#}"))
}
