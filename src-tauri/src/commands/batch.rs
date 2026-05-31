//! Batch IPC commands.

use std::sync::Arc;

use tauri::State;
use tokio_util::sync::CancellationToken;

pub mod ai;

use crate::storage::{PaperRepo, ReadStatus, TagRepo};
use crate::AppState;

async fn install_cancel_token(state: &AppState) -> Result<CancellationToken, String> {
    let mut guard = state.batch_cancel.lock().await;
    if let Some(existing) = guard.as_ref() {
        if !existing.is_cancelled() {
            return Err("a batch is already running; cancel it first".into());
        }
    }
    let tok = CancellationToken::new();
    *guard = Some(tok.clone());
    Ok(tok)
}

async fn clear_cancel_token(state: &AppState) {
    let mut g = state.batch_cancel.lock().await;
    *g = None;
}

#[tauri::command]
pub async fn batch_attach_tag(
    state: State<'_, Arc<AppState>>,
    ids: Vec<String>,
    tag_id: i64,
) -> Result<usize, String> {
    let repo = TagRepo::new(&state.pool);
    let mut ok = 0;
    for id in ids {
        if repo.attach(&id, tag_id).await.is_ok() {
            ok += 1;
        }
    }
    Ok(ok)
}

#[tauri::command]
pub async fn batch_set_status(
    state: State<'_, Arc<AppState>>,
    ids: Vec<String>,
    status: String,
) -> Result<usize, String> {
    let s = match status.as_str() {
        "reading" => ReadStatus::Reading,
        "read" => ReadStatus::Read,
        "must" => ReadStatus::Must,
        _ => ReadStatus::Unread,
    };
    let repo = PaperRepo::new(&state.pool);
    let mut ok = 0;
    for id in ids {
        if repo.set_read_status(&id, s).await.is_ok() {
            ok += 1;
        }
    }
    Ok(ok)
}

#[tauri::command]
pub async fn batch_delete(
    state: State<'_, Arc<AppState>>,
    ids: Vec<String>,
) -> Result<usize, String> {
    let repo = PaperRepo::new(&state.pool);
    let mut ok = 0;
    for id in ids {
        if repo.delete(&id).await.is_ok() {
            ok += 1;
        }
    }
    Ok(ok)
}

#[tauri::command]
pub async fn batch_cancel(state: State<'_, Arc<AppState>>) -> Result<bool, String> {
    let mut g = state.batch_cancel.lock().await;
    if let Some(t) = g.as_ref() {
        t.cancel();
        return Ok(true);
    }
    *g = None;
    Ok(false)
}
