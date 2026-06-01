//! Candidate Inbox IPC commands.

use std::sync::Arc;

use tauri::State;

use crate::storage::{CandidateDraft, CandidatePaper, CandidateRepo};
use crate::AppState;

const STATUSES: &[&str] = &["new", "shortlisted", "queued", "ignored", "imported"];

#[tauri::command]
pub async fn candidates_list(
    state: State<'_, Arc<AppState>>,
    include_ignored: Option<bool>,
) -> Result<Vec<CandidatePaper>, String> {
    CandidateRepo::new(&state.pool)
        .list(include_ignored.unwrap_or(false))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn candidate_upsert(
    state: State<'_, Arc<AppState>>,
    draft: CandidateDraft,
) -> Result<CandidatePaper, String> {
    if draft.title.trim().is_empty() {
        return Err("candidate title is required".into());
    }
    CandidateRepo::new(&state.pool)
        .upsert(&draft)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn candidate_set_status(
    state: State<'_, Arc<AppState>>,
    id: i64,
    status: String,
) -> Result<(), String> {
    if !STATUSES.contains(&status.as_str()) {
        return Err(format!("invalid candidate status: {status}"));
    }
    CandidateRepo::new(&state.pool)
        .update_status(id, &status)
        .await
        .map_err(|e| e.to_string())
}
