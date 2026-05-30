//! Paper library IPC commands.

use std::sync::Arc;
use tauri::State;

use crate::storage::{Paper, PaperRepo, ReadStatus};
use crate::AppState;

#[tauri::command]
pub async fn papers_count(state: State<'_, Arc<AppState>>) -> Result<i64, String> {
    PaperRepo::new(&state.pool)
        .count()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn papers_recent(
    state: State<'_, Arc<AppState>>,
    limit: Option<i64>,
) -> Result<Vec<Paper>, String> {
    PaperRepo::new(&state.pool)
        .list_recent(limit.unwrap_or(50))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn papers_in_folder(
    state: State<'_, Arc<AppState>>,
    folder_id: i64,
    limit: Option<i64>,
    query: Option<String>,
) -> Result<Vec<Paper>, String> {
    let repo = PaperRepo::new(&state.pool);
    match query.as_deref().map(str::trim).filter(|q| !q.is_empty()) {
        Some(q) => {
            repo.search_by_folder(folder_id, q, limit.unwrap_or(200))
                .await
        }
        None => repo.list_by_folder(folder_id, limit.unwrap_or(200)).await,
    }
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_get(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<Option<Paper>, String> {
    PaperRepo::new(&state.pool)
        .get(&id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn papers_search(
    state: State<'_, Arc<AppState>>,
    query: String,
    limit: Option<i64>,
) -> Result<Vec<Paper>, String> {
    PaperRepo::new(&state.pool)
        .search(&query, limit.unwrap_or(100))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn papers_all_arxiv_ids(state: State<'_, Arc<AppState>>) -> Result<Vec<String>, String> {
    PaperRepo::new(&state.pool)
        .list_all_arxiv_ids()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_set_read_status(
    state: State<'_, Arc<AppState>>,
    id: String,
    status: String,
) -> Result<(), String> {
    let s = match status.as_str() {
        "reading" => ReadStatus::Reading,
        "read" => ReadStatus::Read,
        "must" => ReadStatus::Must,
        _ => ReadStatus::Unread,
    };
    PaperRepo::new(&state.pool)
        .set_read_status(&id, s)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_delete(state: State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    PaperRepo::new(&state.pool)
        .delete(&id)
        .await
        .map_err(|e| e.to_string())?;
    // Best-effort: remove sidecar files after the DB row is already gone.
    // A leftover folder is recoverable; surfacing that error would confuse users.
    let dir = state.paths.paper_dir(&id);
    if dir.exists() {
        let _ = std::fs::remove_dir_all(&dir);
    }
    Ok(())
}
