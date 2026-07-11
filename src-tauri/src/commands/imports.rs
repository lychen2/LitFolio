//! Import and discovery IPC commands.

use std::sync::Arc;

use tauri::State;

use crate::bibtex::generate_bibtex;
use crate::ingest::{
    discover_topic, discover_topic_multi, fetch_arxiv, fetch_arxiv_category, fetch_doi,
    parse_bibtex, search_semantic_scholar, PaperDraft, SearchResult, TopicReport, TopicRequest,
};
use crate::storage::{Paper, PaperRepo};
use crate::AppState;

#[tauri::command]
pub async fn import_doi(state: State<'_, Arc<AppState>>, doi: String) -> Result<Paper, String> {
    let normalized = doi.trim().to_string();
    let draft = match fetch_doi(&state.http, &doi).await {
        Ok(draft) => draft,
        Err(error) => {
            log_import_failure("doi", Some(normalized.as_str()), &error.to_string());
            return Err(error.to_string());
        }
    };
    let mut paper = draft.into_paper();
    paper.bibtex = Some(generate_bibtex(&paper));
    if let Err(error) = PaperRepo::new(&state.pool).insert(&paper).await {
        log_import_failure("doi", Some(normalized.as_str()), &error.to_string());
        return Err(error.to_string());
    }
    log_import_success("doi", Some(normalized.as_str()), 1, 0);
    Ok(paper)
}

#[tauri::command]
pub async fn paper_find_by_doi(
    state: State<'_, Arc<AppState>>,
    doi: String,
) -> Result<Option<Paper>, String> {
    PaperRepo::new(&state.pool)
        .find_by_doi(&doi)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn import_arxiv(
    state: State<'_, Arc<AppState>>,
    arxiv_id: String,
) -> Result<Paper, String> {
    let normalized = arxiv_id.trim().to_string();
    let draft = match fetch_arxiv(&state.http, &arxiv_id).await {
        Ok(draft) => draft,
        Err(error) => {
            log_import_failure("arxiv", Some(normalized.as_str()), &error.to_string());
            return Err(error.to_string());
        }
    };
    let mut paper = draft.into_paper();
    paper.bibtex = Some(generate_bibtex(&paper));
    if let Err(error) = PaperRepo::new(&state.pool).insert(&paper).await {
        log_import_failure("arxiv", Some(normalized.as_str()), &error.to_string());
        return Err(error.to_string());
    }
    log_import_success("arxiv", Some(normalized.as_str()), 1, 0);
    Ok(paper)
}

#[tauri::command]
pub async fn import_bibtex(
    state: State<'_, Arc<AppState>>,
    text: String,
) -> Result<Vec<Paper>, String> {
    let drafts = parse_bibtex(&text);
    let repo = PaperRepo::new(&state.pool);
    let mut papers = Vec::with_capacity(drafts.len());
    let total = drafts.len();
    for d in drafts {
        let mut p = d.into_paper();
        p.bibtex = Some(generate_bibtex(&p));
        if let Err(error) = repo.insert(&p).await {
            log_import_failure("bibtex", None, &error.to_string());
            return Err(error.to_string());
        }
        papers.push(p);
    }
    log_import_success(
        "bibtex",
        None,
        papers.len(),
        total.saturating_sub(papers.len()),
    );
    Ok(papers)
}

#[tauri::command]
pub async fn search_papers(
    state: State<'_, Arc<AppState>>,
    query: String,
    limit: Option<u32>,
) -> Result<Vec<SearchResult>, String> {
    search_semantic_scholar(&state.http, &query, limit.unwrap_or(15))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_from_search(
    state: State<'_, Arc<AppState>>,
    result: SearchResult,
) -> Result<Paper, String> {
    let mut paper = result.draft.into_paper();
    paper.bibtex = Some(generate_bibtex(&paper));
    if let Err(error) = PaperRepo::new(&state.pool).insert(&paper).await {
        log_import_failure("search", Some(paper.title.as_str()), &error.to_string());
        return Err(error.to_string());
    }
    log_import_success("search", Some(paper.title.as_str()), 1, 0);
    Ok(paper)
}

#[derive(serde::Serialize)]
pub struct BulkAddSummary {
    pub imported: Vec<Paper>,
    pub skipped: Vec<String>,
}

#[tauri::command]
pub async fn add_many_from_search(
    state: State<'_, Arc<AppState>>,
    results: Vec<SearchResult>,
) -> Result<BulkAddSummary, String> {
    let repo = PaperRepo::new(&state.pool);
    let mut imported = Vec::new();
    let mut skipped = Vec::new();
    for r in results {
        let mut paper = r.draft.into_paper();
        paper.bibtex = Some(generate_bibtex(&paper));
        match repo.insert(&paper).await {
            Ok(()) => imported.push(paper),
            Err(e) => {
                let error = e.to_string();
                log_import_failure("search_batch", Some(paper.title.as_str()), &error);
                skipped.push(format!("{}: {}", paper.title, error));
            }
        }
    }
    log_import_success("search_batch", None, imported.len(), skipped.len());
    Ok(BulkAddSummary { imported, skipped })
}

#[tauri::command]
pub async fn topic_discover(
    state: State<'_, Arc<AppState>>,
    query: String,
    terms: Option<Vec<String>>,
    recent_limit: Option<u32>,
    classic_limit: Option<u32>,
    recent_window_years: Option<u32>,
) -> Result<TopicReport, String> {
    let req = TopicRequest {
        recent_limit: recent_limit.unwrap_or(20),
        classic_limit: classic_limit.unwrap_or(20),
        recent_window_years: recent_window_years.unwrap_or(3),
    };
    if let Some(ts) = terms.as_ref().filter(|v| !v.is_empty()) {
        discover_topic_multi(&state.http, ts, req)
            .await
            .map_err(|e| e.to_string())
    } else {
        discover_topic(&state.http, &query, req)
            .await
            .map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub async fn arxiv_list_category(
    state: State<'_, Arc<AppState>>,
    category: String,
    max_results: Option<u32>,
    start: Option<u32>,
) -> Result<Vec<PaperDraft>, String> {
    fetch_arxiv_category(
        &state.http,
        &category,
        max_results.unwrap_or(50),
        start.unwrap_or(0),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn arxiv_add_draft(
    state: State<'_, Arc<AppState>>,
    draft: PaperDraft,
) -> Result<Paper, String> {
    let mut paper = draft.into_paper();
    paper.bibtex = Some(generate_bibtex(&paper));
    if let Err(error) = PaperRepo::new(&state.pool).insert(&paper).await {
        log_import_failure("arxiv_draft", paper.arxiv_id.as_deref(), &error.to_string());
        return Err(error.to_string());
    }
    log_import_success("arxiv_draft", paper.arxiv_id.as_deref(), 1, 0);
    Ok(paper)
}

#[tauri::command]
pub async fn prepare_doi_draft(
    state: State<'_, Arc<AppState>>,
    doi: String,
) -> Result<PaperDraft, String> {
    fetch_doi(&state.http, &doi)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn prepare_arxiv_draft(
    state: State<'_, Arc<AppState>>,
    arxiv_id: String,
) -> Result<PaperDraft, String> {
    fetch_arxiv(&state.http, &arxiv_id)
        .await
        .map_err(|e| e.to_string())
}

fn log_import_success(
    import_source: &'static str,
    identifier: Option<&str>,
    imported_count: usize,
    failed_count: usize,
) {
    tracing::info!(
        import_source,
        identifier = identifier.unwrap_or(""),
        imported_count,
        failed_count,
        "paper import completed"
    );
}

fn log_import_failure(import_source: &'static str, identifier: Option<&str>, failure_reason: &str) {
    tracing::warn!(
        import_source,
        identifier = identifier.unwrap_or(""),
        failure_reason,
        "paper import failed"
    );
}
