//! IPC command surface exposed to the React frontend.

pub mod ask;
pub mod feeds;
pub mod graph;
pub mod reader_terms;
pub mod reader_translate;
pub mod survey;
pub mod sync;
pub mod term_filter;

use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use ulid::Ulid;

use crate::ai::{
    active_profile, active_profile_for_task, chat_complete, expand_search_query, list_models,
    load_config, quick_read_paper_text, save_config, summarize_paper_text, ChatMessage,
    ExpandedQuery, GroupingStrategy, LlmConfig, LlmProfile, LitReviewResult, QuickReadResult,
    TaskKind, TldrResult,
};
use crate::ingest::{
    discover_topic, discover_topic_multi, fetch_arxiv, fetch_arxiv_category, fetch_doi,
    import_pdf_file, parse_bibtex, search_semantic_scholar, PaperDraft, SearchResult, TopicReport,
    TopicRequest,
};
use crate::storage::{
    dedup, notes, unified_search, ComparisonRepo, Concept, ConceptRelation, ConceptRepo,
    CustomFieldDef, CustomFieldRepo, DuplicatePair, FilterRule, Folder, FolderRepo,
    FolderWithCount, Highlight, HighlightRepo, NoteSection, NoteSectionRepo, Paper,
    PaperComparison, PaperConcept, PaperCustomField, PaperRepo, QueueEntry, QueueRepo, ReadStatus,
    SmartCollection, SmartCollectionRepo, Tag, TagRepo, TagWithCount, TopicAlert, TopicAlertRepo,
    TopicAlertResult, UnifiedSearchResult,
};
use crate::bibtex::generate_bibtex;
use crate::discovery::citations::{fetch_citations, CitationGraph};
use crate::discovery::similar::{find_similar, Recommendation};
use crate::export::citations::{export_bibtex, export_ris, format_citations, CitationStyle};
use crate::export::markdown::{export_all_md, export_paper_md, ExportSummary};
use crate::AppState;

#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {name}, welcome to LitFolio.")
}

#[tauri::command]
pub fn app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[tauri::command]
pub fn library_root(state: State<'_, Arc<AppState>>) -> String {
    state.paths.root.display().to_string()
}

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
) -> Result<Vec<Paper>, String> {
    PaperRepo::new(&state.pool)
        .list_by_folder(folder_id, limit.unwrap_or(200))
        .await
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
pub async fn search_unified(
    state: State<'_, Arc<AppState>>,
    query: String,
    limit: Option<i64>,
) -> Result<Vec<UnifiedSearchResult>, String> {
    unified_search(&state.pool, &query, limit.unwrap_or(50))
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
    // Best-effort: also remove the paper's directory (PDF + extracted text + any future
    // sidecar files). Failure here must not roll the DB row back — the row is already gone
    // and a leftover folder is recoverable; surfacing the error would only confuse users.
    let dir = state.paths.paper_dir(&id);
    if dir.exists() {
        let _ = std::fs::remove_dir_all(&dir);
    }
    Ok(())
}

// ─── Tags ────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn tags_list(state: State<'_, Arc<AppState>>) -> Result<Vec<TagWithCount>, String> {
    TagRepo::new(&state.pool)
        .list()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn tag_create(
    state: State<'_, Arc<AppState>>,
    name: String,
    color: Option<String>,
) -> Result<Tag, String> {
    TagRepo::new(&state.pool)
        .create(&name, color.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn tag_rename(
    state: State<'_, Arc<AppState>>,
    id: i64,
    new_name: String,
) -> Result<(), String> {
    TagRepo::new(&state.pool)
        .rename(id, &new_name)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn tag_set_color(
    state: State<'_, Arc<AppState>>,
    id: i64,
    color: Option<String>,
) -> Result<(), String> {
    TagRepo::new(&state.pool)
        .set_color(id, color.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn tag_delete(state: State<'_, Arc<AppState>>, id: i64) -> Result<(), String> {
    TagRepo::new(&state.pool)
        .delete(id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_attach_tag(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    tag_id: i64,
) -> Result<(), String> {
    TagRepo::new(&state.pool)
        .attach(&paper_id, tag_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_detach_tag(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    tag_id: i64,
) -> Result<(), String> {
    TagRepo::new(&state.pool)
        .detach(&paper_id, tag_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_tags(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
) -> Result<Vec<Tag>, String> {
    TagRepo::new(&state.pool)
        .for_paper(&paper_id)
        .await
        .map_err(|e| e.to_string())
}

// ─── Folders ─────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn folders_list(state: State<'_, Arc<AppState>>) -> Result<Vec<FolderWithCount>, String> {
    FolderRepo::new(&state.pool)
        .list()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn folder_create(
    state: State<'_, Arc<AppState>>,
    name: String,
    parent_id: Option<i64>,
) -> Result<Folder, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("folder name must not be empty".into());
    }
    FolderRepo::new(&state.pool)
        .create(trimmed, parent_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn folder_rename(
    state: State<'_, Arc<AppState>>,
    id: i64,
    name: String,
) -> Result<(), String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("folder name must not be empty".into());
    }
    FolderRepo::new(&state.pool)
        .rename(id, trimmed)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn folder_delete(state: State<'_, Arc<AppState>>, id: i64) -> Result<(), String> {
    FolderRepo::new(&state.pool)
        .delete(id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_attach_folder(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    folder_id: i64,
) -> Result<(), String> {
    FolderRepo::new(&state.pool)
        .attach(&paper_id, folder_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_detach_folder(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    folder_id: i64,
) -> Result<(), String> {
    FolderRepo::new(&state.pool)
        .detach(&paper_id, folder_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_folders(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
) -> Result<Vec<Folder>, String> {
    FolderRepo::new(&state.pool)
        .for_paper(&paper_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn import_doi(state: State<'_, Arc<AppState>>, doi: String) -> Result<Paper, String> {
    let draft = fetch_doi(&state.http, &doi)
        .await
        .map_err(|e| e.to_string())?;
    let mut paper = draft.into_paper();
    paper.bibtex = Some(generate_bibtex(&paper));
    PaperRepo::new(&state.pool)
        .insert(&paper)
        .await
        .map_err(|e| e.to_string())?;
    Ok(paper)
}

#[tauri::command]
pub async fn import_arxiv(
    state: State<'_, Arc<AppState>>,
    arxiv_id: String,
) -> Result<Paper, String> {
    let draft = fetch_arxiv(&state.http, &arxiv_id)
        .await
        .map_err(|e| e.to_string())?;
    let mut paper = draft.into_paper();
    paper.bibtex = Some(generate_bibtex(&paper));
    PaperRepo::new(&state.pool)
        .insert(&paper)
        .await
        .map_err(|e| e.to_string())?;
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
    for d in drafts {
        let mut p = d.into_paper();
        p.bibtex = Some(generate_bibtex(&p));
        repo.insert(&p).await.map_err(|e| e.to_string())?;
        papers.push(p);
    }
    Ok(papers)
}

#[derive(serde::Serialize)]
pub struct PdfImportSummary {
    pub imported: Vec<Paper>,
    pub failed: Vec<PdfFailure>,
}

#[derive(serde::Serialize)]
pub struct PdfFailure {
    pub path: String,
    pub error: String,
}

#[tauri::command]
pub async fn import_pdf_files(
    state: State<'_, Arc<AppState>>,
    paths: Vec<String>,
) -> Result<PdfImportSummary, String> {
    let library = state.paths.clone();
    let http = state.http.clone();
    let repo = PaperRepo::new(&state.pool);
    let mut imported = Vec::new();
    let mut failed = Vec::new();
    for p in paths {
        let path = PathBuf::from(&p);
        let paper_id = Ulid::new().to_string();
        let library_clone = library.clone();
        let path_clone = path.clone();
        let id_clone = paper_id.clone();
        let result = tokio::task::spawn_blocking(move || {
            import_pdf_file(&path_clone, &id_clone, &library_clone)
        })
        .await
        .map_err(|e| e.to_string())?;
        match result {
            Ok(r) => {
                let mut draft = r.draft;
                // If DOI was extracted from the PDF text, fetch full metadata from CrossRef.
                if let Some(ref doi) = draft.doi {
                    if let Ok(crossref) = fetch_doi(&http, doi).await {
                        // CrossRef fields are more reliable — use them when available.
                        if !crossref.title.is_empty() && crossref.title != "(untitled)" {
                            draft.title = crossref.title;
                        }
                        if !crossref.authors.is_empty() {
                            draft.authors = crossref.authors;
                        }
                        if crossref.year.is_some() {
                            draft.year = crossref.year;
                        }
                        if crossref.venue.is_some() {
                            draft.venue = crossref.venue;
                        }
                        if crossref.abstract_text.is_some() {
                            draft.abstract_text = crossref.abstract_text;
                        }
                    }
                }
                let mut paper = draft.into_paper();
                paper.id = paper_id;
                paper.pdf_path = Some(r.stored_path.display().to_string());
                paper.bibtex = Some(generate_bibtex(&paper));
                if let Err(e) = repo.insert(&paper).await {
                    failed.push(PdfFailure {
                        path: p,
                        error: e.to_string(),
                    });
                } else {
                    imported.push(paper);
                }
            }
            Err(e) => failed.push(PdfFailure {
                path: p,
                error: e.to_string(),
            }),
        }
    }
    Ok(PdfImportSummary { imported, failed })
}

// ─── Folder import (recursive, with progress) ─────────────────────────

#[derive(serde::Serialize, Clone)]
pub struct FolderImportProgress {
    pub phase: String, // "scanning", "importing", "done"
    pub done: usize,
    pub total: usize,
    pub current_file: String,
    pub failed: usize,
}

#[tauri::command]
pub async fn import_folder(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    dir_path: String,
) -> Result<PdfImportSummary, String> {
    let library = state.paths.clone();
    let http = state.http.clone();
    let repo = PaperRepo::new(&state.pool);

    // 1. Scan directory recursively for PDFs
    let _ = app.emit("folder-import-progress", FolderImportProgress {
        phase: "scanning".into(),
        done: 0,
        total: 0,
        current_file: String::new(),
        failed: 0,
    });

    let dir = PathBuf::from(&dir_path);
    let pdf_paths = walk_pdfs(&dir);
    let total = pdf_paths.len();

    if total == 0 {
        return Ok(PdfImportSummary {
            imported: Vec::new(),
            failed: Vec::new(),
        });
    }

    let mut imported = Vec::new();
    let mut failed = Vec::new();

    // 2. Import each PDF with progress events
    for (i, path) in pdf_paths.iter().enumerate() {
        let _ = app.emit("folder-import-progress", FolderImportProgress {
            phase: "importing".into(),
            done: i,
            total,
            current_file: path.file_name().unwrap_or_default().to_string_lossy().to_string(),
            failed: failed.len(),
        });

        let paper_id = Ulid::new().to_string();
        let library_clone = library.clone();
        let path_clone = path.clone();
        let id_clone = paper_id.clone();

        let result = tokio::task::spawn_blocking(move || {
            import_pdf_file(&path_clone, &id_clone, &library_clone)
        })
        .await
        .map_err(|e| e.to_string())?;

        match result {
            Ok(r) => {
                let mut draft = r.draft;
                // Apply filename heuristic if title is generic
                if draft.title == "(untitled)" || draft.title.is_empty() {
                    if let Some((h_title, h_authors, h_year)) = parse_filename_heuristic(path) {
                        if h_title != "(untitled)" {
                            draft.title = h_title;
                        }
                        if !h_authors.is_empty() && draft.authors.is_empty() {
                            draft.authors = h_authors;
                        }
                        if h_year.is_some() && draft.year.is_none() {
                            draft.year = h_year;
                        }
                    }
                }
                // Fetch CrossRef if DOI available
                if let Some(ref doi) = draft.doi {
                    if let Ok(crossref) = fetch_doi(&http, doi).await {
                        if !crossref.title.is_empty() && crossref.title != "(untitled)" {
                            draft.title = crossref.title;
                        }
                        if !crossref.authors.is_empty() {
                            draft.authors = crossref.authors;
                        }
                        if crossref.year.is_some() {
                            draft.year = crossref.year;
                        }
                        if crossref.venue.is_some() {
                            draft.venue = crossref.venue;
                        }
                        if crossref.abstract_text.is_some() {
                            draft.abstract_text = crossref.abstract_text;
                        }
                    }
                }
                let mut paper = draft.into_paper();
                paper.id = paper_id;
                paper.pdf_path = Some(r.stored_path.display().to_string());
                paper.bibtex = Some(generate_bibtex(&paper));
                if let Err(e) = repo.insert(&paper).await {
                    failed.push(PdfFailure {
                        path: path.display().to_string(),
                        error: e.to_string(),
                    });
                } else {
                    imported.push(paper);
                }
            }
            Err(e) => failed.push(PdfFailure {
                path: path.display().to_string(),
                error: e.to_string(),
            }),
        }
    }

    let _ = app.emit("folder-import-progress", FolderImportProgress {
        phase: "done".into(),
        done: total,
        total,
        current_file: String::new(),
        failed: failed.len(),
    });

    Ok(PdfImportSummary { imported, failed })
}

/// Recursively walk a directory and collect all .pdf file paths.
fn walk_pdfs(dir: &PathBuf) -> Vec<PathBuf> {
    let mut result = Vec::new();
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                result.extend(walk_pdfs(&path));
            } else if path.extension().map_or(false, |e| e.eq_ignore_ascii_case("pdf")) {
                result.push(path);
            }
        }
    }
    result
}

/// Try to extract metadata from a filename like `Author_Year_Title.pdf` or
/// `Author - Year - Title.pdf` or `Author (Year) Title.pdf`.
fn parse_filename_heuristic(path: &PathBuf) -> Option<(String, Vec<String>, Option<i32>)> {
    let stem = path.file_stem()?.to_string_lossy().to_string();

    // Pattern: Author_Year_Title  or  Author - Year - Title
    let sep_re = regex::Regex::new(r"[_\s]*[-–]\s*|_").ok()?;
    let parts: Vec<&str> = sep_re.splitn(&stem, 3).collect();
    if parts.len() >= 3 {
        let year = parts[1].trim().parse::<i32>().ok();
        if year.is_some() {
            let authors: Vec<String> = parts[0]
                .split(|c: char| c == '&' || c == ',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();
            let title = parts[2].replace('_', " ").trim().to_string();
            return Some((title, authors, year));
        }
    }

    // Pattern: Author (Year) Title
    let paren_re = regex::Regex::new(r"^(.+?)\s*\((\d{4})\)\s*(.+)$").ok()?;
    if let Some(caps) = paren_re.captures(&stem) {
        let author_str = caps.get(1)?.as_str();
        let year = caps.get(2)?.as_str().parse::<i32>().ok();
        let title = caps.get(3)?.as_str().replace('_', " ").trim().to_string();
        let authors: Vec<String> = author_str
            .split(|c: char| c == '&' || c == ',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        return Some((title, authors, year));
    }

    // Pattern: Year_Title
    let year_title_re = regex::Regex::new(r"^(\d{4})[_\s]+(.+)$").ok()?;
    if let Some(caps) = year_title_re.captures(&stem) {
        let year = caps.get(1)?.as_str().parse::<i32>().ok();
        let title = caps.get(2)?.as_str().replace('_', " ").trim().to_string();
        return Some((title, Vec::new(), year));
    }

    None
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
    PaperRepo::new(&state.pool)
        .insert(&paper)
        .await
        .map_err(|e| e.to_string())?;
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
            Err(e) => skipped.push(format!("{}: {}", paper.title, e)),
        }
    }
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
    PaperRepo::new(&state.pool)
        .insert(&paper)
        .await
        .map_err(|e| e.to_string())?;
    Ok(paper)
}

pub(crate) async fn download_pdf(
    http: &reqwest::Client,
    url: &str,
    dest: &std::path::Path,
) -> anyhow::Result<u64> {
    use std::io::Write;
    let resp = http.get(url).send().await?;
    if !resp.status().is_success() {
        anyhow::bail!("PDF download returned {}", resp.status());
    }
    let bytes = resp.bytes().await?;
    if bytes.len() < 1024 {
        anyhow::bail!(
            "PDF response too small ({} bytes), likely not a valid PDF",
            bytes.len()
        );
    }
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut f = std::fs::File::create(dest)?;
    f.write_all(&bytes)?;
    Ok(bytes.len() as u64)
}

#[tauri::command]
pub async fn arxiv_add_with_pdf(
    state: State<'_, Arc<AppState>>,
    arxiv_id: String,
) -> Result<Paper, String> {
    let draft = fetch_arxiv(&state.http, &arxiv_id)
        .await
        .map_err(|e| e.to_string())?;
    let resolved_id = draft.arxiv_id.clone().unwrap_or(arxiv_id.clone());
    let stripped = resolved_id
        .split('v')
        .next()
        .unwrap_or(&resolved_id)
        .to_string();
    let pdf_url = format!("https://arxiv.org/pdf/{stripped}.pdf");
    let paper_id = Ulid::new().to_string();
    let pdf_path = state.paths.paper_dir(&paper_id).join("original.pdf");
    download_pdf(&state.http, &pdf_url, &pdf_path)
        .await
        .map_err(|e| format!("failed to download arXiv PDF: {e}"))?;
    let mut paper = draft.into_paper();
    paper.id = paper_id;
    paper.pdf_path = Some(pdf_path.display().to_string());
    paper.bibtex = Some(generate_bibtex(&paper));
    PaperRepo::new(&state.pool)
        .insert(&paper)
        .await
        .map_err(|e| e.to_string())?;
    Ok(paper)
}

// ─── Two-step metadata + PDF flow ────────────────────────────────────────

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

#[tauri::command]
pub async fn paper_save_with_pdf(
    state: State<'_, Arc<AppState>>,
    draft: PaperDraft,
    source_pdf_path: String,
) -> Result<Paper, String> {
    let paper_id = Ulid::new().to_string();
    let dest = state.paths.paper_dir(&paper_id).join("original.pdf");
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::copy(&source_pdf_path, &dest).map_err(|e| format!("copy PDF: {e}"))?;
    let mut paper = draft.into_paper();
    paper.id = paper_id;
    paper.pdf_path = Some(dest.display().to_string());
    paper.bibtex = Some(generate_bibtex(&paper));
    PaperRepo::new(&state.pool)
        .insert(&paper)
        .await
        .map_err(|e| e.to_string())?;
    Ok(paper)
}

#[tauri::command]
pub async fn paper_attach_pdf(
    state: State<'_, Arc<AppState>>,
    id: String,
    source_pdf_path: String,
) -> Result<Paper, String> {
    let repo = PaperRepo::new(&state.pool);
    if repo.get(&id).await.map_err(|e| e.to_string())?.is_none() {
        return Err(format!("paper {id} not found"));
    }
    let dest = state.paths.paper_dir(&id).join("original.pdf");
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("create paper dir: {e}"))?;
    }
    std::fs::copy(&source_pdf_path, &dest).map_err(|e| format!("copy PDF: {e}"))?;
    let dest_str = dest.display().to_string();
    repo.update_pdf_path(&id, &dest_str)
        .await
        .map_err(|e| e.to_string())?;
    repo.get(&id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "paper vanished after update".to_string())
}

/// Spawn the system PDF viewer for this paper's bound PDF.
/// We bypass tauri-plugin-shell here because its `open` returns success immediately
/// even when the underlying xdg-open is slow (DE detection) or silently fails — that
/// leaves the UI looking dead. Spawning ourselves at least validates the binary exists
/// and the path is openable; the viewer takes over from there.
#[tauri::command]
pub async fn paper_open_pdf(state: State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    let paper = PaperRepo::new(&state.pool)
        .get(&id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("paper {id} not found"))?;
    let path = paper
        .pdf_path
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "这篇文献还没有绑定 PDF,请先点击 📎 添加 PDF".to_string())?;
    if !std::path::Path::new(&path).exists() {
        return Err(format!("PDF 文件不存在(已被删除或移动):{path}"));
    }
    let opener = if cfg!(target_os = "linux") {
        "xdg-open"
    } else if cfg!(target_os = "macos") {
        "open"
    } else if cfg!(target_os = "windows") {
        "explorer"
    } else {
        return Err("unsupported OS".into());
    };
    std::process::Command::new(opener)
        .arg(&path)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("启动 {opener} 失败: {e}"))?;
    Ok(())
}

/// Return the bound PDF's raw bytes. The frontend wraps these in a Blob URL and
/// feeds it to pdfjs — sidesteps Tauri's asset:// protocol entirely, which has been
/// flaky on this host (no error, no spinner termination, just black screen). Slower
/// than streaming via a custom protocol but the cost is paid once per open.
#[tauri::command]
pub async fn paper_read_pdf_bytes(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<Vec<u8>, String> {
    let paper = PaperRepo::new(&state.pool)
        .get(&id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("paper {id} not found"))?;
    let path = paper
        .pdf_path
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "这篇文献还没有绑定 PDF".to_string())?;
    std::fs::read(&path).map_err(|e| format!("read pdf {path}: {e}"))
}

// ─── LLM config ──────────────────────────────────────────────────────────

#[tauri::command]
pub fn llm_get_config(state: State<'_, Arc<AppState>>) -> Result<LlmConfig, String> {
    load_config(&state.paths).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn llm_save_config(state: State<'_, Arc<AppState>>, config: LlmConfig) -> Result<(), String> {
    save_config(&state.paths, &config).map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
pub struct LlmTestResult {
    pub ok: bool,
    pub model: String,
    pub reply: String,
}

#[tauri::command]
pub async fn llm_test(
    state: State<'_, Arc<AppState>>,
    profile: LlmProfile,
) -> Result<LlmTestResult, String> {
    let resp = chat_complete(
        &state.http,
        &profile,
        &[
            ChatMessage {
                role: "system".into(),
                content: "Reply with the single word: pong".into(),
            },
            ChatMessage {
                role: "user".into(),
                content: "ping".into(),
            },
        ],
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(LlmTestResult {
        ok: !resp.content.trim().is_empty(),
        model: resp.model,
        reply: resp.content,
    })
}

// ─── Paper summarization ─────────────────────────────────────────────────

#[tauri::command]
pub async fn paper_tldr(state: State<'_, Arc<AppState>>, id: String) -> Result<TldrResult, String> {
    let cfg = load_config(&state.paths).map_err(|e| e.to_string())?;
    let output_language = cfg.output_language.as_str();
    let prof = active_profile_for_task(&cfg, TaskKind::Tldr)
        .map_err(|e| e.to_string())?
        .clone();
    let repo = PaperRepo::new(&state.pool);
    let paper = repo
        .get(&id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "paper not found".to_string())?;
    let result = summarize_paper_text(
        &state.http,
        &prof,
        &paper.title,
        &paper.authors,
        paper.venue.as_deref(),
        paper.year,
        paper.abstract_text.as_deref(),
        None,
        output_language,
    )
    .await
    .map_err(|e| e.to_string())?;
    repo.update_tldr(&id, &result.tldr, &result.key_findings)
        .await
        .map_err(|e| e.to_string())?;
    Ok(result)
}

#[tauri::command]
pub async fn paper_quick_read(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<QuickReadResult, String> {
    let cfg = load_config(&state.paths).map_err(|e| e.to_string())?;
    let output_language = cfg.output_language.as_str();
    let prof = active_profile_for_task(&cfg, TaskKind::QuickRead)
        .map_err(|e| e.to_string())?
        .clone();
    let repo = PaperRepo::new(&state.pool);
    let paper = repo
        .get(&id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "paper not found".to_string())?;
    let result = quick_read_paper_text(
        &state.http,
        &prof,
        &paper.title,
        &paper.authors,
        paper.venue.as_deref(),
        paper.year,
        paper.abstract_text.as_deref(),
        None,
        output_language,
    )
    .await
    .map_err(|e| e.to_string())?;
    repo.update_quick_read(
        &id,
        &result.problem,
        &result.method,
        &result.comparison,
        &result.limitations,
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(result)
}

#[tauri::command]
pub async fn paper_translate(
    state: State<'_, Arc<AppState>>,
    id: String,
    target_lang: Option<String>,
) -> Result<crate::ai::TranslationResult, String> {
    let cfg = load_config(&state.paths).map_err(|e| e.to_string())?;
    let prof = active_profile_for_task(&cfg, TaskKind::Translate)
        .map_err(|e| e.to_string())?
        .clone();
    let repo = PaperRepo::new(&state.pool);
    let paper = repo
        .get(&id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "paper not found".to_string())?;
    let lang = target_lang.unwrap_or_else(|| "Chinese".to_string());
    let result = crate::ai::translate_paper_text(
        &state.http,
        &prof,
        &paper.title,
        paper.abstract_text.as_deref(),
        &lang,
    )
    .await
    .map_err(|e| e.to_string())?;
    repo.update_translation(
        &id,
        &result.title,
        &result.abstract_text,
        &result.target_lang,
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(result)
}

#[tauri::command]
pub async fn draft_translate(
    state: State<'_, Arc<AppState>>,
    draft: PaperDraft,
    target_lang: Option<String>,
) -> Result<crate::ai::TranslationResult, String> {
    let cfg = load_config(&state.paths).map_err(|e| e.to_string())?;
    let prof = active_profile_for_task(&cfg, TaskKind::Translate).map_err(|e| e.to_string())?;
    let lang = target_lang.unwrap_or_else(|| "Chinese".to_string());
    crate::ai::translate_paper_text(
        &state.http,
        &prof,
        &draft.title,
        draft.abstract_text.as_deref(),
        &lang,
    )
    .await
    .map_err(|e| e.to_string())
}

// ─── Batch primitives ────────────────────────────────────────────────────

use tokio_util::sync::CancellationToken;

#[derive(serde::Serialize)]
pub struct BatchError {
    pub paper_id: String,
    pub title: String,
    pub message: String,
}

#[derive(serde::Serialize)]
pub struct BatchSummary {
    pub kind: String,
    pub total: usize,
    pub ok: usize,
    pub failed: usize,
    pub cancelled: bool,
    pub errors: Vec<BatchError>,
}

fn install_cancel_token(state: &AppState) -> Result<CancellationToken, String> {
    let mut guard = state.batch_cancel.lock().map_err(|e| e.to_string())?;
    if let Some(existing) = guard.as_ref() {
        if !existing.is_cancelled() {
            return Err("a batch is already running; cancel it first".into());
        }
    }
    let tok = CancellationToken::new();
    *guard = Some(tok.clone());
    Ok(tok)
}

fn clear_cancel_token(state: &AppState) {
    if let Ok(mut g) = state.batch_cancel.lock() {
        *g = None;
    }
}

// ─── Batch commands (synchronous, no AI) ─────────────────────────────────

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

// ─── Batch commands (AI, with progress events) ──────────────────────────

async fn run_ai_batch<F, Fut>(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    kind: &'static str,
    ids: Vec<String>,
    mut op: F,
) -> Result<BatchSummary, String>
where
    F: FnMut(Paper) -> Fut,
    Fut: std::future::Future<Output = anyhow::Result<()>>,
{
    let token = install_cancel_token(&state)?;
    let total = ids.len();
    let mut ok = 0usize;
    let mut errors = Vec::<BatchError>::new();
    let repo = PaperRepo::new(&state.pool);

    for id in ids {
        if token.is_cancelled() {
            break;
        }
        let paper = match repo.get(&id).await.map_err(|e| e.to_string())? {
            Some(p) => p,
            None => {
                errors.push(BatchError {
                    paper_id: id,
                    title: "(missing)".into(),
                    message: "paper not found".into(),
                });
                continue;
            }
        };
        let _ = app.emit(
            "batch-progress",
            serde_json::json!({
                "kind": kind, "done": ok + errors.len(), "total": total,
                "current_id": paper.id, "current_title": paper.title, "phase": "start",
            }),
        );
        match op(paper.clone()).await {
            Ok(()) => {
                ok += 1;
                let _ = app.emit(
                    "batch-progress",
                    serde_json::json!({
                        "kind": kind, "done": ok + errors.len(), "total": total,
                        "current_id": paper.id, "current_title": paper.title, "phase": "ok",
                    }),
                );
            }
            Err(e) => {
                let msg = e.to_string();
                errors.push(BatchError {
                    paper_id: paper.id.clone(),
                    title: paper.title.clone(),
                    message: msg.clone(),
                });
                let _ = app.emit(
                    "batch-progress",
                    serde_json::json!({
                        "kind": kind, "done": ok + errors.len(), "total": total,
                        "current_id": paper.id, "current_title": paper.title,
                        "phase": "fail", "error": msg,
                    }),
                );
            }
        }
    }
    let cancelled = token.is_cancelled();
    clear_cancel_token(&state);
    let summary = BatchSummary {
        kind: kind.to_string(),
        total,
        ok,
        failed: errors.len(),
        cancelled,
        errors,
    };
    let _ = app.emit("batch-done", &summary);
    Ok(summary)
}

#[tauri::command]
pub async fn batch_tldr(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    ids: Vec<String>,
) -> Result<BatchSummary, String> {
    let cfg = load_config(&state.paths).map_err(|e| e.to_string())?;
    let output_language = cfg.output_language.clone();
    let prof = active_profile_for_task(&cfg, TaskKind::Tldr)
        .map_err(|e| e.to_string())?
        .clone();
    let http = state.http.clone();
    let pool = state.pool.clone();
    run_ai_batch(app, state, "tldr", ids, move |paper| {
        let http = http.clone();
        let prof = prof.clone();
        let pool = pool.clone();
        let output_language = output_language.clone();
        async move {
            let r = summarize_paper_text(
                &http,
                &prof,
                &paper.title,
                &paper.authors,
                paper.venue.as_deref(),
                paper.year,
                paper.abstract_text.as_deref(),
                None,
                &output_language,
            )
            .await?;
            PaperRepo::new(&pool)
                .update_tldr(&paper.id, &r.tldr, &r.key_findings)
                .await?;
            Ok(())
        }
    })
    .await
}

#[tauri::command]
pub async fn batch_quick_read(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    ids: Vec<String>,
) -> Result<BatchSummary, String> {
    let cfg = load_config(&state.paths).map_err(|e| e.to_string())?;
    let output_language = cfg.output_language.clone();
    let prof = active_profile_for_task(&cfg, TaskKind::QuickRead)
        .map_err(|e| e.to_string())?
        .clone();
    let http = state.http.clone();
    let pool = state.pool.clone();
    run_ai_batch(app, state, "quick_read", ids, move |paper| {
        let http = http.clone();
        let prof = prof.clone();
        let pool = pool.clone();
        let output_language = output_language.clone();
        async move {
            let r = quick_read_paper_text(
                &http,
                &prof,
                &paper.title,
                &paper.authors,
                paper.venue.as_deref(),
                paper.year,
                paper.abstract_text.as_deref(),
                None,
                &output_language,
            )
            .await?;
            PaperRepo::new(&pool)
                .update_quick_read(
                    &paper.id,
                    &r.problem,
                    &r.method,
                    &r.comparison,
                    &r.limitations,
                )
                .await?;
            Ok(())
        }
    })
    .await
}

#[tauri::command]
pub async fn batch_translate(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    ids: Vec<String>,
    target_lang: Option<String>,
) -> Result<BatchSummary, String> {
    let cfg = load_config(&state.paths).map_err(|e| e.to_string())?;
    let prof = active_profile_for_task(&cfg, TaskKind::Translate)
        .map_err(|e| e.to_string())?
        .clone();
    let lang = target_lang.unwrap_or_else(|| "Chinese".to_string());
    let http = state.http.clone();
    let pool = state.pool.clone();
    run_ai_batch(app, state, "translate", ids, move |paper| {
        let http = http.clone();
        let prof = prof.clone();
        let pool = pool.clone();
        let lang = lang.clone();
        async move {
            let r = crate::ai::translate_paper_text(
                &http,
                &prof,
                &paper.title,
                paper.abstract_text.as_deref(),
                &lang,
            )
            .await?;
            PaperRepo::new(&pool)
                .update_translation(&paper.id, &r.title, &r.abstract_text, &r.target_lang)
                .await?;
            Ok(())
        }
    })
    .await
}

#[tauri::command]
pub fn batch_cancel(state: State<'_, Arc<AppState>>) -> Result<bool, String> {
    let mut g = state.batch_cancel.lock().map_err(|e| e.to_string())?;
    if let Some(t) = g.as_ref() {
        t.cancel();
        return Ok(true);
    }
    *g = None;
    Ok(false)
}

// ─── BibTeX backfill ────────────────────────────────────────────────────

#[tauri::command]
pub async fn bibtex_backfill(state: State<'_, Arc<AppState>>) -> Result<usize, String> {
    let repo = PaperRepo::new(&state.pool);
    let papers = repo.list_needing_bibtex().await.map_err(|e| e.to_string())?;
    let count = papers.len();
    for p in &papers {
        let bib = generate_bibtex(p);
        repo.update_bibtex(&p.id, &bib)
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(count)
}

// ─── Markdown Export ────────────────────────────────────────────────────

#[tauri::command]
pub fn export_markdown_dir(state: State<'_, Arc<AppState>>) -> Result<Option<String>, String> {
    let cfg = load_config(&state.paths).map_err(|e| e.to_string())?;
    Ok(cfg.export_dir)
}

#[tauri::command]
pub fn export_markdown_set_dir(
    state: State<'_, Arc<AppState>>,
    dir: String,
) -> Result<(), String> {
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
    pub format: String,       // "bibtex", "ris", "apa", "ieee", "gb/t7714", "chicago"
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

// ─── Paper Comparisons ──────────────────────────────────────────────────

#[tauri::command]
pub async fn paper_comparisons_list(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<PaperComparison>, String> {
    ComparisonRepo::new(&state.pool)
        .list_all()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_comparison_get(
    state: State<'_, Arc<AppState>>,
    id: i64,
) -> Result<Option<PaperComparison>, String> {
    ComparisonRepo::new(&state.pool)
        .get(id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_comparison_create(
    state: State<'_, Arc<AppState>>,
    paper_ids: Vec<String>,
    content: String,
    model: String,
) -> Result<i64, String> {
    ComparisonRepo::new(&state.pool)
        .insert(&paper_ids, &content, &model)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_comparison_update(
    state: State<'_, Arc<AppState>>,
    id: i64,
    content: String,
) -> Result<(), String> {
    ComparisonRepo::new(&state.pool)
        .update_content(id, &content)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_comparison_delete(
    state: State<'_, Arc<AppState>>,
    id: i64,
) -> Result<(), String> {
    ComparisonRepo::new(&state.pool)
        .delete(id)
        .await
        .map_err(|e| e.to_string())
}

// ─── Note Sections (Structured Notes) ───────────────────────────────────

#[tauri::command]
pub async fn note_sections_get(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
) -> Result<Vec<NoteSection>, String> {
    let repo = NoteSectionRepo::new(&state.pool);
    repo.ensure_defaults(&paper_id)
        .await
        .map_err(|e| e.to_string())?;
    repo.list_by_paper(&paper_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn note_sections_save(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    section_key: String,
    content: String,
    source: Option<String>,
) -> Result<(), String> {
    NoteSectionRepo::new(&state.pool)
        .save(&paper_id, &section_key, &content, &source.unwrap_or_else(|| "user".into()))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn note_sections_reorder(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    section_ids: Vec<i64>,
) -> Result<(), String> {
    NoteSectionRepo::new(&state.pool)
        .reorder(&paper_id, &section_ids)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn note_section_delete(
    state: State<'_, Arc<AppState>>,
    id: i64,
) -> Result<(), String> {
    NoteSectionRepo::new(&state.pool)
        .delete(id)
        .await
        .map_err(|e| e.to_string())
}

// ─── Similar Paper Recommendations ──────────────────────────────────────

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

// ─── Citation Network ──────────────────────────────────────────────────

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

// ─── Reading Queue ─────────────────────────────────────────────────────

#[tauri::command]
pub async fn queue_list(state: State<'_, Arc<AppState>>) -> Result<Vec<QueueEntry>, String> {
    QueueRepo::new(&state.pool)
        .list()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn queue_add(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    priority: Option<i32>,
    target_date: Option<i64>,
    note: Option<String>,
) -> Result<(), String> {
    QueueRepo::new(&state.pool)
        .add(&paper_id, priority.unwrap_or(0), target_date, note.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn queue_remove(state: State<'_, Arc<AppState>>, paper_id: String) -> Result<(), String> {
    QueueRepo::new(&state.pool)
        .remove(&paper_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn queue_update(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    priority: i32,
    target_date: Option<i64>,
    note: Option<String>,
) -> Result<(), String> {
    QueueRepo::new(&state.pool)
        .update(&paper_id, priority, target_date, note.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn queue_reorder(state: State<'_, Arc<AppState>>, paper_ids: Vec<String>) -> Result<(), String> {
    QueueRepo::new(&state.pool)
        .reorder(&paper_ids)
        .await
        .map_err(|e| e.to_string())
}

// ─── Reader: highlights + notes ──────────────────────────────────────────

#[tauri::command]
pub async fn highlight_create(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    page: i32,
    rect: serde_json::Value,
    text: String,
    color: Option<String>,
    label: Option<String>,
) -> Result<Highlight, String> {
    HighlightRepo::new(&state.pool)
        .insert(&paper_id, page, &rect, &text, color.as_deref(), label.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn highlight_list(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
) -> Result<Vec<Highlight>, String> {
    HighlightRepo::new(&state.pool)
        .list_by_paper(&paper_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn highlight_update_note(
    state: State<'_, Arc<AppState>>,
    id: String,
    note: Option<String>,
) -> Result<(), String> {
    HighlightRepo::new(&state.pool)
        .update_note(&id, note.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn highlight_update_label(
    state: State<'_, Arc<AppState>>,
    id: String,
    label: Option<String>,
) -> Result<(), String> {
    HighlightRepo::new(&state.pool)
        .update_label(&id, label.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn highlight_delete(state: State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    HighlightRepo::new(&state.pool)
        .delete(&id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn note_get(state: State<'_, Arc<AppState>>, paper_id: String) -> Result<String, String> {
    notes::read(&state.paths, &paper_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn note_save(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    content: String,
) -> Result<(), String> {
    notes::write(&state.paths, &paper_id, &content).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn llm_list_models(
    state: State<'_, Arc<AppState>>,
    profile: LlmProfile,
) -> Result<Vec<String>, String> {
    list_models(&state.http, &profile)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_expand_query(
    state: State<'_, Arc<AppState>>,
    raw: String,
) -> Result<ExpandedQuery, String> {
    let cfg = load_config(&state.paths).map_err(|e| e.to_string())?;
    let prof = active_profile(&cfg).map_err(|e| e.to_string())?.clone();
    expand_search_query(&state.http, &prof, &raw)
        .await
        .map_err(|e| e.to_string())
}

// ─── Literature review generation ───────────────────────────────────────

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

// ─── Smart collections ──────────────────────────────────────────────────

#[tauri::command]
pub async fn smart_collections_list(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<SmartCollection>, String> {
    let repo = SmartCollectionRepo::new(&state.pool);
    repo.list().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn smart_collection_create(
    state: State<'_, Arc<AppState>>,
    name: String,
    rules: FilterRule,
) -> Result<i64, String> {
    let repo = SmartCollectionRepo::new(&state.pool);
    repo.create(&name, &rules).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn smart_collection_update(
    state: State<'_, Arc<AppState>>,
    id: i64,
    name: String,
    rules: FilterRule,
) -> Result<(), String> {
    let repo = SmartCollectionRepo::new(&state.pool);
    repo.update(id, &name, &rules)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn smart_collection_delete(
    state: State<'_, Arc<AppState>>,
    id: i64,
) -> Result<(), String> {
    let repo = SmartCollectionRepo::new(&state.pool);
    repo.delete(id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn smart_collection_query_papers(
    state: State<'_, Arc<AppState>>,
    id: i64,
) -> Result<Vec<Paper>, String> {
    let repo = SmartCollectionRepo::new(&state.pool);
    repo.query_papers(id).await.map_err(|e| e.to_string())
}

// ─── Paper deduplication ────────────────────────────────────────────────

#[tauri::command]
pub async fn paper_find_duplicate(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
) -> Result<Option<Paper>, String> {
    let repo = PaperRepo::new(&state.pool);
    let paper = repo
        .get(&paper_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "paper not found".to_string())?;
    dedup::find_duplicate(&state.pool, &paper)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_scan_duplicates(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<DuplicatePair>, String> {
    dedup::scan_all_duplicates(&state.pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_merge(
    state: State<'_, Arc<AppState>>,
    keep_id: String,
    merge_id: String,
) -> Result<(), String> {
    dedup::merge_papers(&state.pool, &keep_id, &merge_id)
        .await
        .map_err(|e| e.to_string())
}

// ─── Custom metadata fields ─────────────────────────────────────────────

#[tauri::command]
pub async fn custom_field_defs_list(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<CustomFieldDef>, String> {
    let repo = CustomFieldRepo::new(&state.pool);
    repo.list_defs().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn custom_field_def_create(
    state: State<'_, Arc<AppState>>,
    name: String,
    field_type: String,
    options: Option<Vec<String>>,
) -> Result<i64, String> {
    let repo = CustomFieldRepo::new(&state.pool);
    let opts = options.as_deref();
    repo.create_def(&name, &field_type, opts)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn custom_field_def_delete(
    state: State<'_, Arc<AppState>>,
    id: i64,
) -> Result<(), String> {
    let repo = CustomFieldRepo::new(&state.pool);
    repo.delete_def(id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_custom_fields_get(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
) -> Result<Vec<PaperCustomField>, String> {
    let repo = CustomFieldRepo::new(&state.pool);
    repo.get_paper_fields(&paper_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_custom_field_set(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    field_id: i64,
    value: String,
) -> Result<(), String> {
    let repo = CustomFieldRepo::new(&state.pool);
    repo.set_paper_field(&paper_id, field_id, &value)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_custom_field_delete(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    field_id: i64,
) -> Result<(), String> {
    let repo = CustomFieldRepo::new(&state.pool);
    repo.delete_paper_field(&paper_id, field_id)
        .await
        .map_err(|e| e.to_string())
}

// ─── Topic Alerts ─────────────────────────────────────────────────────

#[tauri::command]
pub async fn topic_alerts_list(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<TopicAlert>, String> {
    TopicAlertRepo::new(&state.pool)
        .list()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn topic_alert_create(
    state: State<'_, Arc<AppState>>,
    query: String,
    frequency: String,
    target_folder_id: Option<i64>,
    auto_import: bool,
) -> Result<i64, String> {
    TopicAlertRepo::new(&state.pool)
        .create(&query, &frequency, target_folder_id, auto_import)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn topic_alert_delete(
    state: State<'_, Arc<AppState>>,
    id: i64,
) -> Result<(), String> {
    TopicAlertRepo::new(&state.pool)
        .delete(id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn topic_alert_results_list(
    state: State<'_, Arc<AppState>>,
    alert_id: i64,
    unseen_only: Option<bool>,
) -> Result<Vec<TopicAlertResult>, String> {
    TopicAlertRepo::new(&state.pool)
        .list_results(alert_id, unseen_only.unwrap_or(false))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn topic_alert_result_mark_seen(
    state: State<'_, Arc<AppState>>,
    result_id: i64,
) -> Result<(), String> {
    TopicAlertRepo::new(&state.pool)
        .mark_seen(result_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn topic_alert_mark_all_seen(
    state: State<'_, Arc<AppState>>,
    alert_id: i64,
) -> Result<(), String> {
    TopicAlertRepo::new(&state.pool)
        .mark_all_seen(alert_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn topic_alert_unseen_count(
    state: State<'_, Arc<AppState>>,
) -> Result<i64, String> {
    TopicAlertRepo::new(&state.pool)
        .unseen_count()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn topic_alert_run(
    state: State<'_, Arc<AppState>>,
    alert_id: i64,
) -> Result<usize, String> {
    let repo = TopicAlertRepo::new(&state.pool);
    let alerts = repo.list().await.map_err(|e| e.to_string())?;
    let alert = alerts
        .into_iter()
        .find(|a| a.id == alert_id)
        .ok_or_else(|| "alert not found".to_string())?;

    let results = search_semantic_scholar(&state.http, &alert.query, 20)
        .await
        .map_err(|e| e.to_string())?;

    let mut added = 0usize;

    for r in &results {
        let doi = r.draft.doi.as_deref();
        let arxiv_id = r.draft.arxiv_id.as_deref();

        if repo.result_exists(doi, arxiv_id).await.unwrap_or(false) {
            continue;
        }

        let _ = repo
            .add_result(
                alert_id,
                doi,
                arxiv_id,
                &r.draft.title,
                Some(&r.draft.authors.join(", ")),
                r.draft.year,
                r.draft.abstract_text.as_deref(),
            )
            .await;
        added += 1;
    }

    repo.update_last_run(alert_id).await.map_err(|e| e.to_string())?;
    Ok(added)
}

#[tauri::command]
pub async fn topic_alert_run_all(state: State<'_, Arc<AppState>>) -> Result<usize, String> {
    let repo = TopicAlertRepo::new(&state.pool);
    let pending = repo.pending_alerts().await.map_err(|e| e.to_string())?;
    let mut total_added = 0usize;

    for alert in pending {
        let results = search_semantic_scholar(&state.http, &alert.query, 20)
            .await
            .unwrap_or_default();

        for r in &results {
            let doi = r.draft.doi.as_deref();
            let arxiv_id = r.draft.arxiv_id.as_deref();

            if repo.result_exists(doi, arxiv_id).await.unwrap_or(false) {
                continue;
            }

            let _ = repo
                .add_result(
                    alert.id,
                    doi,
                    arxiv_id,
                    &r.draft.title,
                    Some(&r.draft.authors.join(", ")),
                    r.draft.year,
                    r.draft.abstract_text.as_deref(),
                )
                .await;
            total_added += 1;
        }

        let _ = repo.update_last_run(alert.id).await;
    }

    Ok(total_added)
}

// ─── Concepts ─────────────────────────────────────────────────────

#[tauri::command]
pub async fn concepts_list(state: State<'_, Arc<AppState>>) -> Result<Vec<Concept>, String> {
    ConceptRepo::new(&state.pool)
        .list_all()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn concept_create(
    state: State<'_, Arc<AppState>>,
    name: String,
    description: Option<String>,
) -> Result<i64, String> {
    ConceptRepo::new(&state.pool)
        .create(&name, description.as_deref(), "user")
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn concept_delete(state: State<'_, Arc<AppState>>, id: i64) -> Result<(), String> {
    ConceptRepo::new(&state.pool)
        .delete(id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn concept_relations_list(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<ConceptRelation>, String> {
    ConceptRepo::new(&state.pool)
        .list_relations()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn concept_relation_create(
    state: State<'_, Arc<AppState>>,
    source_id: i64,
    target_id: i64,
    relation: String,
    evidence_paper_id: Option<String>,
    snippet: Option<String>,
) -> Result<i64, String> {
    ConceptRepo::new(&state.pool)
        .create_relation(
            source_id,
            target_id,
            &relation,
            evidence_paper_id.as_deref(),
            snippet.as_deref(),
        )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn concept_relation_delete(
    state: State<'_, Arc<AppState>>,
    id: i64,
) -> Result<(), String> {
    ConceptRepo::new(&state.pool)
        .delete_relation(id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn concept_link_paper(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    concept_id: i64,
    relevance: Option<f64>,
) -> Result<(), String> {
    ConceptRepo::new(&state.pool)
        .link_paper(&paper_id, concept_id, relevance.unwrap_or(1.0))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn concept_unlink_paper(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    concept_id: i64,
) -> Result<(), String> {
    ConceptRepo::new(&state.pool)
        .unlink_paper(&paper_id, concept_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn concept_for_paper(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
) -> Result<Vec<PaperConcept>, String> {
    ConceptRepo::new(&state.pool)
        .concepts_for_paper(&paper_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn concept_extract_from_paper(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
) -> Result<Vec<crate::ai::ExtractedConcept>, String> {
    let repo = PaperRepo::new(&state.pool);
    let paper = repo
        .get(&paper_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("paper {paper_id} not found"))?;

    // Use abstract_text as the source for concept extraction
    let text = paper
        .abstract_text
        .as_deref()
        .or(paper.tldr.as_deref())
        .unwrap_or("");

    if text.is_empty() {
        return Err("paper has no text content for concept extraction".into());
    }

    crate::ai::extract_concepts(&state.http, &state.paths, &paper.title, text)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn concept_extract_and_store(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
) -> Result<usize, String> {
    let repo = PaperRepo::new(&state.pool);
    let paper = repo
        .get(&paper_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("paper {paper_id} not found"))?;

    let text = paper
        .abstract_text
        .as_deref()
        .or(paper.tldr.as_deref())
        .unwrap_or("");

    if text.is_empty() {
        return Err("paper has no text content for concept extraction".into());
    }

    let extracted = crate::ai::extract_concepts(&state.http, &state.paths, &paper.title, text)
        .await
        .map_err(|e| e.to_string())?;

    let concept_repo = ConceptRepo::new(&state.pool);
    let mut count = 0usize;

    for ec in &extracted {
        // Create or get existing concept
        let concept_id = match concept_repo.find_by_name(&ec.name).await.map_err(|e| e.to_string())? {
            Some(c) => c.id,
            None => {
                concept_repo
                    .create(&ec.name, Some(&ec.description), "ai")
                    .await
                    .map_err(|e| e.to_string())?
            }
        };

        // Link paper to concept
        concept_repo
            .link_paper(&paper_id, concept_id, 1.0)
            .await
            .map_err(|e| e.to_string())?;

        // Create relations to other concepts
        for rel in &ec.relations {
            if let Some(target) = concept_repo.find_by_name(&rel.target).await.map_err(|e| e.to_string())? {
                concept_repo
                    .create_relation(
                        concept_id,
                        target.id,
                        &rel.relation,
                        Some(&paper_id),
                        rel.snippet.as_deref(),
                    )
                    .await
                    .map_err(|e| e.to_string())?;
            }
        }

        count += 1;
    }

    Ok(count)
}
