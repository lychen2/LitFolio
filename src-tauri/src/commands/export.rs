//! Export-related IPC commands.

use std::sync::Arc;

use tauri::State;

use crate::ai::{load_config, save_config};
use crate::bibtex::generate_bibtex;
use crate::export::citations::{export_bibtex, export_ris, format_citations, CitationStyle};
use crate::export::markdown::{export_all_md, export_paper_md, ExportSummary};
use crate::storage::PaperRepo;
use crate::AppState;

#[tauri::command]
pub async fn bibtex_backfill(state: State<'_, Arc<AppState>>) -> Result<usize, String> {
    let repo = PaperRepo::new(&state.pool);
    let papers = repo
        .list_needing_bibtex()
        .await
        .map_err(|e| e.to_string())?;
    let count = papers.len();
    for p in &papers {
        let bib = generate_bibtex(p);
        repo.update_bibtex(&p.id, &bib)
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(count)
}

#[tauri::command]
pub fn export_markdown_dir(state: State<'_, Arc<AppState>>) -> Result<Option<String>, String> {
    let cfg = load_config(&state.paths).map_err(|e| e.to_string())?;
    Ok(cfg.export_dir)
}

#[tauri::command]
pub fn export_markdown_set_dir(state: State<'_, Arc<AppState>>, dir: String) -> Result<(), String> {
    let mut cfg = load_config(&state.paths).map_err(|e| e.to_string())?;
    cfg.export_dir = Some(dir);
    save_config(&state.paths, &cfg).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_markdown_all(
    state: State<'_, Arc<AppState>>,
    incremental: Option<bool>,
) -> Result<ExportSummary, String> {
    let cfg = load_config(&state.paths).map_err(|e| e.to_string())?;
    let dir = cfg
        .export_dir
        .ok_or_else(|| "export directory not configured".to_string())?;
    let export_path = std::path::PathBuf::from(&dir);
    export_all_md(
        &state.pool,
        &state.paths,
        &export_path,
        incremental.unwrap_or(true),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_markdown_paper(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
) -> Result<String, String> {
    let cfg = load_config(&state.paths).map_err(|e| e.to_string())?;
    let dir = cfg
        .export_dir
        .ok_or_else(|| "export directory not configured".to_string())?;
    let export_path = std::path::PathBuf::from(&dir);
    let repo = PaperRepo::new(&state.pool);
    let paper = repo
        .get(&paper_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("paper {paper_id} not found"))?;
    let path = export_paper_md(&state.pool, &state.paths, &paper, &export_path)
        .await
        .map_err(|e| e.to_string())?;
    Ok(path.display().to_string())
}

#[derive(serde::Deserialize)]
pub struct ExportCitationsRequest {
    pub paper_ids: Vec<String>,
    pub format: String, // "bibtex", "ris", "apa", "ieee", "gb/t7714", "chicago"
}

#[tauri::command]
pub async fn export_citations(
    state: State<'_, Arc<AppState>>,
    request: ExportCitationsRequest,
) -> Result<String, String> {
    let repo = PaperRepo::new(&state.pool);
    let mut papers = Vec::new();
    for id in &request.paper_ids {
        if let Some(p) = repo.get(id).await.map_err(|e| e.to_string())? {
            papers.push(p);
        }
    }
    let output = match request.format.as_str() {
        "ris" => export_ris(&papers),
        "bibtex" => export_bibtex(&papers),
        style => format_citations(&papers, CitationStyle::from_str(style)),
    };
    Ok(output)
}
