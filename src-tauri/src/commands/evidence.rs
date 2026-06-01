//! Evidence board IPC commands.

use std::sync::Arc;

use tauri::State;

use crate::storage::{EvidenceDraft, EvidenceItem, EvidenceRepo};
use crate::AppState;

#[tauri::command]
pub async fn evidence_list(
    state: State<'_, Arc<AppState>>,
    project_id: i64,
) -> Result<Vec<EvidenceItem>, String> {
    EvidenceRepo::new(&state.pool)
        .list(project_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn evidence_add(
    state: State<'_, Arc<AppState>>,
    project_id: i64,
    draft: EvidenceDraft,
) -> Result<EvidenceItem, String> {
    EvidenceRepo::new(&state.pool)
        .add(project_id, &draft)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn evidence_add_from_highlight(
    state: State<'_, Arc<AppState>>,
    project_id: i64,
    highlight_id: String,
) -> Result<EvidenceItem, String> {
    EvidenceRepo::new(&state.pool)
        .add_from_highlight(project_id, &highlight_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn evidence_delete(state: State<'_, Arc<AppState>>, id: i64) -> Result<(), String> {
    EvidenceRepo::new(&state.pool)
        .delete(id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn evidence_export_markdown(
    state: State<'_, Arc<AppState>>,
    project_id: i64,
) -> Result<String, String> {
    let items = EvidenceRepo::new(&state.pool)
        .list(project_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(render_evidence_markdown(&items))
}

fn render_evidence_markdown(items: &[EvidenceItem]) -> String {
    let mut out = String::from("# Evidence Board\n\n");
    for item in items {
        let title = item.paper_title.as_deref().unwrap_or("Unlinked source");
        out.push_str(&format!("## {title}\n\n"));
        if let Some(label) = &item.label {
            out.push_str(&format!("- Type: {label}\n"));
        }
        if let Some(page) = item.page {
            out.push_str(&format!("- Page: {page}\n"));
        }
        out.push_str(&format!("\n> {}\n", item.excerpt.replace('\n', "\n> ")));
        if let Some(note) = &item.note {
            out.push_str(&format!("\nNote: {note}\n"));
        }
        out.push('\n');
    }
    out
}
