//! Paper discovery IPC commands.

use std::sync::Arc;

use tauri::State;

use crate::discovery::citations::{fetch_citations, CitationGraph};
use crate::discovery::similar::{find_similar, Recommendation};
use crate::storage::PaperRepo;
use crate::AppState;

#[tauri::command]
pub async fn paper_similar(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<Vec<Recommendation>, String> {
    let repo = PaperRepo::new(&state.pool);
    let paper = repo
        .get(&id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("paper {id} not found"))?;
    find_similar(
        &state.pool,
        &state.http,
        &paper.id,
        paper.doi.as_deref(),
        paper.arxiv_id.as_deref(),
        &paper.title,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_citations(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<CitationGraph, String> {
    let repo = PaperRepo::new(&state.pool);
    let paper = repo
        .get(&id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("paper {id} not found"))?;
    fetch_citations(
        &state.pool,
        &state.http,
        &paper.id,
        paper.doi.as_deref(),
        paper.arxiv_id.as_deref(),
        &paper.title,
    )
    .await
    .map_err(|e| e.to_string())
}
