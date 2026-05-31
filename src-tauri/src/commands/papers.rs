//! Paper library IPC commands.

use std::sync::Arc;
use tauri::State;

use crate::bibtex::generate_bibtex;
use crate::ingest::{fetch_doi, PaperDraft};
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

    // Guard the UNIQUE(doi) constraint up front so we can return a friendly
    // message instead of a raw SQLite error when the DOI belongs elsewhere.
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
    paper.doi = Some(resolved_doi);
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
            arxiv_id: None,
            abstract_text: Some("real abstract".into()),
        };
        merge_draft_into_paper(&mut paper, draft, "10.1/real".into());
        assert_eq!(paper.title, "Real Title");
        assert_eq!(paper.authors, vec!["A. Real".to_string()]);
        assert_eq!(paper.year, Some(2020));
        assert_eq!(paper.venue.as_deref(), Some("Nature"));
        assert_eq!(paper.abstract_text.as_deref(), Some("real abstract"));
        assert_eq!(paper.doi.as_deref(), Some("10.1/real"));
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
