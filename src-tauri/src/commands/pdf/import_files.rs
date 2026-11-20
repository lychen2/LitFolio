use std::sync::Arc;

use tauri::{AppHandle, State};

use super::common::PdfImportSummary;
use crate::reading_service::ReadingService;
use crate::AppState;

#[tauri::command]
pub async fn pdf_document_names(
    _app: AppHandle,
    uris: Vec<String>,
) -> Result<Vec<Option<String>>, String> {
    #[cfg(target_os = "android")]
    {
        super::android_source::document_names(&_app, uris)
            .await
            .map_err(|error| format!("{error:#}"))
    }
    #[cfg(not(target_os = "android"))]
    Ok(vec![None; uris.len()])
}

/// System file selection and window drops use the canonical upstream import.
#[tauri::command]
pub async fn import_pdf_files(
    app: AppHandle,
    service: State<'_, ReadingService>,
    state: State<'_, Arc<AppState>>,
    paths: Vec<String>,
) -> Result<PdfImportSummary, String> {
    #[cfg(target_os = "android")]
    if paths
        .iter()
        .any(|path| path.starts_with("content://") || path.starts_with("file://"))
    {
        return import_android_files(&app, &service, &state, paths).await;
    }
    service
        .import_files(&app, &state, paths)
        .await
        .map_err(|e| format!("{e:#}"))
}

#[cfg(target_os = "android")]
async fn import_android_files(
    app: &AppHandle,
    service: &ReadingService,
    state: &AppState,
    paths: Vec<String>,
) -> Result<PdfImportSummary, String> {
    use super::android_source::{file_uri_path, StagedPdf};
    use super::common::PdfFailure;
    use std::collections::HashMap;

    let mut local_paths = Vec::with_capacity(paths.len());
    let mut staged_files = HashMap::new();
    let mut failed = Vec::new();
    for path in paths {
        if path.starts_with("content://") {
            match StagedPdf::open(app, &path).await {
                Ok(pdf) => {
                    let local = pdf.path().display().to_string();
                    staged_files.insert(local.clone(), (path, pdf));
                    local_paths.push(local);
                }
                Err(error) => failed.push(PdfFailure {
                    path,
                    error: format!("{error:#}"),
                }),
            }
        } else if path.starts_with("file://") {
            match file_uri_path(&path) {
                Ok(local) => local_paths.push(local.display().to_string()),
                Err(error) => failed.push(PdfFailure {
                    path,
                    error: format!("{error:#}"),
                }),
            }
        } else {
            local_paths.push(path);
        }
    }

    if local_paths.is_empty() {
        return Ok(PdfImportSummary {
            imported: Vec::new(),
            failed,
        });
    }
    let mut summary = service
        .import_files(app, state, local_paths)
        .await
        .map_err(|e| format!("{e:#}"))?;
    for failure in &mut summary.failed {
        if let Some((uri, _)) = staged_files.get(&failure.path) {
            failure.error = failure.error.replace(&failure.path, uri);
            failure.path = uri.clone();
        }
    }
    summary.failed.extend(failed);
    Ok(summary)
}
