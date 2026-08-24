//! Paper library IPC commands.

use std::sync::Arc;
use std::time::Instant;
use tauri::State;
use tracing::Instrument;

use crate::bibtex::generate_bibtex;
use crate::ingest::{fetch_doi, PaperDraft};
use crate::storage::{Paper, PaperRepo, ReadStatus};
use crate::AppState;

#[tauri::command]
pub async fn papers_count(state: State<'_, Arc<AppState>>) -> Result<i64, String> {
    let started = Instant::now();
    let result = PaperRepo::new(&state.pool)
        .count()
        .instrument(tracing::info_span!("papers_count"))
        .await
        .map_err(|e| e.to_string());
    match &result {
        Ok(count) => tracing::info!(
            command = "papers_count",
            count,
            elapsed_ms = elapsed_ms(started),
            "paper command completed"
        ),
        Err(error) => tracing::error!(
            command = "papers_count",
            error = %error,
            elapsed_ms = elapsed_ms(started),
            "paper command failed"
        ),
    }
    result
}

#[tauri::command]
pub async fn papers_recent(
    state: State<'_, Arc<AppState>>,
    limit: Option<i64>,
) -> Result<Vec<Paper>, String> {
    let started = Instant::now();
    let effective_limit = limit.unwrap_or(50);
    let result = PaperRepo::new(&state.pool)
        .list_recent(effective_limit)
        .instrument(tracing::info_span!(
            "papers_recent",
            limit = effective_limit
        ))
        .await
        .map_err(|e| e.to_string());
    log_paper_list_command("papers_recent", started, effective_limit, None, &result);
    result
}

#[tauri::command]
pub async fn papers_in_folder(
    state: State<'_, Arc<AppState>>,
    folder_id: i64,
    limit: Option<i64>,
    query: Option<String>,
) -> Result<Vec<Paper>, String> {
    let started = Instant::now();
    let effective_limit = limit.unwrap_or(200);
    let query_len = query.as_deref().map(str::trim).map(str::len).unwrap_or(0);
    let repo = PaperRepo::new(&state.pool);
    let result = match query.as_deref().map(str::trim).filter(|q| !q.is_empty()) {
        Some(q) => {
            repo.search_by_folder(folder_id, q, effective_limit)
                .instrument(tracing::info_span!(
                    "papers_in_folder",
                    folder_id,
                    limit = effective_limit,
                    query_len,
                    mode = "search"
                ))
                .await
        }
        None => {
            repo.list_by_folder(folder_id, effective_limit)
                .instrument(tracing::info_span!(
                    "papers_in_folder",
                    folder_id,
                    limit = effective_limit,
                    query_len,
                    mode = "list"
                ))
                .await
        }
    }
    .map_err(|e| e.to_string());
    log_paper_list_command(
        "papers_in_folder",
        started,
        effective_limit,
        Some(query_len),
        &result,
    );
    result
}

#[tauri::command]
pub async fn paper_get(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<Option<Paper>, String> {
    let started = Instant::now();
    let result = PaperRepo::new(&state.pool)
        .get(&id)
        .instrument(tracing::info_span!("paper_get", paper_id = %id))
        .await
        .map_err(|e| e.to_string());
    match &result {
        Ok(paper) => tracing::info!(
            command = "paper_get",
            paper_id = %id,
            found = paper.is_some(),
            elapsed_ms = elapsed_ms(started),
            "paper command completed"
        ),
        Err(error) => tracing::error!(
            command = "paper_get",
            paper_id = %id,
            error = %error,
            elapsed_ms = elapsed_ms(started),
            "paper command failed"
        ),
    }
    result
}

#[tauri::command]
pub async fn papers_search(
    state: State<'_, Arc<AppState>>,
    query: String,
    limit: Option<i64>,
) -> Result<Vec<Paper>, String> {
    let started = Instant::now();
    let effective_limit = limit.unwrap_or(100);
    let query_len = query.trim().len();
    let result = PaperRepo::new(&state.pool)
        .search(&query, effective_limit)
        .instrument(tracing::info_span!(
            "papers_search",
            limit = effective_limit,
            query_len
        ))
        .await
        .map_err(|e| e.to_string());
    log_paper_list_command(
        "papers_search",
        started,
        effective_limit,
        Some(query_len),
        &result,
    );
    result
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
    let dir = state.paths.paper_dir(&id);
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| format!("remove {}: {e}", dir.display()))?;
    }
    Ok(())
}

/// Re-fetch CrossRef metadata for an existing paper using a user-supplied DOI
/// and overwrite its bibliographic fields. This rescues papers whose DOI wasn't
/// recognized at import time (e.g. PDF text extraction missed it). CrossRef
/// values win, falling back to the existing field when CrossRef omits one —
/// the same merge policy as PDF import (`pdf/import_files.rs`).
#[tauri::command]
pub async fn paper_enrich_from_doi(
    state: State<'_, Arc<AppState>>,
    id: String,
    doi: String,
) -> Result<Paper, String> {
    let repo = PaperRepo::new(&state.pool);
    let mut paper = repo
        .get(&id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("paper {id} not found"))?;

    let draft = fetch_doi(&state.http, &doi)
        .await
        .map_err(|e| e.to_string())?;

    // Guard unique identifiers up front so we can return a friendly message
    // instead of a raw SQLite error when the DOI belongs elsewhere.
    let resolved_doi = draft.doi.clone().unwrap_or(doi);
    if let Some(other) = repo
        .find_by_doi(&resolved_doi)
        .await
        .map_err(|e| e.to_string())?
    {
        if other.id != paper.id {
            return Err(format!("该 DOI 已属于库中另一篇文献:「{}」", other.title));
        }
    }
    if let Some(arxiv_id) = draft.arxiv_id.as_deref() {
        if let Some(other) = repo
            .find_by_arxiv_id(arxiv_id)
            .await
            .map_err(|e| e.to_string())?
        {
            if other.id != paper.id {
                return Err(format!(
                    "该 arXiv ID 已属于库中另一篇文献:「{}」",
                    other.title
                ));
            }
        }
    }

    merge_draft_into_paper(&mut paper, draft, resolved_doi);
    paper.bibtex = Some(generate_bibtex(&paper));

    repo.update_metadata(&paper)
        .await
        .map_err(|e| e.to_string())?;
    Ok(paper)
}

/// Overwrite `paper`'s bibliographic fields with CrossRef `draft` values,
/// keeping the existing value whenever the draft omits a field. `resolved_doi`
/// is the DOI to persist (the draft's normalized DOI, or the user's input when
/// CrossRef returns none). Pure so the merge policy can be unit-tested.
fn merge_draft_into_paper(paper: &mut Paper, draft: PaperDraft, resolved_doi: String) {
    if !draft.title.is_empty() && draft.title != "(untitled)" {
        paper.title = draft.title;
    }
    if !draft.authors.is_empty() {
        paper.authors = draft.authors;
    }
    if draft.year.is_some() {
        paper.year = draft.year;
    }
    if draft.venue.is_some() {
        paper.venue = draft.venue;
    }
    if draft.abstract_text.is_some() {
        paper.abstract_text = draft.abstract_text;
    }
    if draft.arxiv_id.is_some() {
        paper.arxiv_id = draft.arxiv_id;
    }
    paper.doi = Some(resolved_doi);
}

fn elapsed_ms(started: Instant) -> u128 {
    started.elapsed().as_millis()
}

fn log_paper_list_command(
    command: &str,
    started: Instant,
    limit: i64,
    query_len: Option<usize>,
    result: &Result<Vec<Paper>, String>,
) {
    match result {
        Ok(papers) => tracing::info!(
            command,
            limit,
            query_len,
            result_count = papers.len(),
            elapsed_ms = elapsed_ms(started),
            "paper command completed"
        ),
        Err(error) => tracing::error!(
            command,
            limit,
            query_len,
            error = %error,
            elapsed_ms = elapsed_ms(started),
            "paper command failed"
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn paper_with_title(title: &str) -> Paper {
        let mut p = PaperDraft {
            title: title.into(),
            authors: vec!["Old Author".into()],
            year: Some(2019),
            venue: Some("Old Venue".into()),
            doi: None,
            arxiv_id: None,
            abstract_text: Some("old abstract".into()),
        }
        .into_paper();
        p.id = "01TEST".into();
        p
    }

    #[test]
    fn merge_prefers_crossref_when_present() {
        let mut paper = paper_with_title("PDF-derived garbled title");
        let draft = PaperDraft {
            title: "Real Title".into(),
            authors: vec!["A. Real".into()],
            year: Some(2020),
            venue: Some("Nature".into()),
            doi: Some("10.1/real".into()),
            arxiv_id: Some("2511.03175v2".into()),
            abstract_text: Some("real abstract".into()),
        };
        merge_draft_into_paper(&mut paper, draft, "10.1/real".into());
        assert_eq!(paper.title, "Real Title");
        assert_eq!(paper.authors, vec!["A. Real".to_string()]);
        assert_eq!(paper.year, Some(2020));
        assert_eq!(paper.venue.as_deref(), Some("Nature"));
        assert_eq!(paper.abstract_text.as_deref(), Some("real abstract"));
        assert_eq!(paper.doi.as_deref(), Some("10.1/real"));
        assert_eq!(paper.arxiv_id.as_deref(), Some("2511.03175v2"));
    }

    #[test]
    fn merge_allows_user_supplied_arxiv_identity_to_replace_existing() {
        let mut paper = paper_with_title("Existing arXiv paper");
        paper.arxiv_id = Some("2511.03175v2".into());
        let draft = PaperDraft {
            arxiv_id: Some("2311.17496v5".into()),
            ..PaperDraft::default()
        };
        merge_draft_into_paper(&mut paper, draft, "10.48550/arXiv.2311.17496".into());
        assert_eq!(paper.arxiv_id.as_deref(), Some("2311.17496v5"));
        assert_eq!(paper.doi.as_deref(), Some("10.48550/arXiv.2311.17496"));
    }

    #[test]
    fn merge_keeps_existing_when_crossref_omits() {
        let mut paper = paper_with_title("Keep Me");
        // CrossRef returned only a DOI — every other field is empty/None.
        let draft = PaperDraft {
            title: String::new(),
            authors: vec![],
            year: None,
            venue: None,
            doi: Some("10.2/sparse".into()),
            arxiv_id: None,
            abstract_text: None,
        };
        merge_draft_into_paper(&mut paper, draft, "10.2/sparse".into());
        assert_eq!(paper.title, "Keep Me");
        assert_eq!(paper.authors, vec!["Old Author".to_string()]);
        assert_eq!(paper.year, Some(2019));
        assert_eq!(paper.venue.as_deref(), Some("Old Venue"));
        assert_eq!(paper.abstract_text.as_deref(), Some("old abstract"));
        // The DOI is always set to the resolved value.
        assert_eq!(paper.doi.as_deref(), Some("10.2/sparse"));
    }
}
