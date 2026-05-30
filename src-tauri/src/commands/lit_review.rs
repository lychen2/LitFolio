//! Literature review IPC commands.

use std::sync::Arc;

use tauri::State;

use crate::ai::{
    active_profile_for_task, load_config, GroupingStrategy, LitReviewResult, TaskKind,
};
use crate::storage::PaperRepo;
use crate::AppState;

#[tauri::command]
pub async fn generate_lit_review(
    state: State<'_, Arc<AppState>>,
    paper_ids: Vec<String>,
    grouping: GroupingStrategy,
) -> Result<LitReviewResult, String> {
    let cfg = load_config(&state.paths).map_err(|e| e.to_string())?;
    let output_language = cfg.output_language.as_str();
    let prof = active_profile_for_task(&cfg, TaskKind::LitReview)
        .map_err(|e| e.to_string())?
        .clone();
    let repo = PaperRepo::new(&state.pool);
    let mut papers = Vec::new();
    for id in &paper_ids {
        match repo.get(id).await.map_err(|e| e.to_string())? {
            Some(p) => papers.push(p),
            None => return Err(format!("paper not found: {}", id)),
        }
    }
    crate::ai::generate_review(&state.http, &prof, &papers, grouping, output_language)
        .await
        .map_err(|e| e.to_string())
}
