use std::path::{Path, PathBuf};
use std::sync::Arc;

use tauri::{AppHandle, State};
use tokio::task::JoinSet;
use ulid::Ulid;

use super::common::{
    attach_imported_pdf_to_existing, existing_paper_for_draft, PdfFailure, PdfImportSummary,
};
use crate::bibtex::generate_bibtex;
use crate::commands::events::emit_or_warn;
use crate::ingest::{fetch_doi, import_pdf_file};
use crate::storage::{LibraryPaths, Paper, PaperRepo, Pool};
use crate::AppState;

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
    let pool = state.pool.clone();

    // 1. Scan directory recursively for PDFs
    emit_or_warn(
        &app,
        "folder-import-progress",
        &FolderImportProgress {
            phase: "scanning".into(),
            done: 0,
            total: 0,
            current_file: String::new(),
            failed: 0,
        },
    );

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
    let mut tasks = JoinSet::new();
    let mut next_path = 0;
    let mut done = 0;

    while next_path < total || !tasks.is_empty() {
        while next_path < total && tasks.len() < 4 {
            let path = pdf_paths[next_path].clone();
            next_path += 1;
            let pool = pool.clone();
            let library = library.clone();
            let http = http.clone();
            tasks.spawn(async move { import_one_folder_pdf(pool, library, http, path).await });
        }

        if let Some(result) = tasks.join_next().await {
            done += 1;
            match result.map_err(|e| e.to_string())? {
                Ok(paper) => imported.push(paper),
                Err(failure) => failed.push(failure),
            }
            emit_or_warn(
                &app,
                "folder-import-progress",
                &FolderImportProgress {
                    phase: "importing".into(),
                    done,
                    total,
                    current_file: String::new(),
                    failed: failed.len(),
                },
            );
        }
    }

    emit_or_warn(
        &app,
        "folder-import-progress",
        &FolderImportProgress {
            phase: "done".into(),
            done: total,
            total,
            current_file: String::new(),
            failed: failed.len(),
        },
    );

    Ok(PdfImportSummary { imported, failed })
}

async fn import_one_folder_pdf(
    pool: Pool,
    library: LibraryPaths,
    http: reqwest::Client,
    path: PathBuf,
) -> Result<Paper, PdfFailure> {
    let repo = PaperRepo::new(&pool);
    let paper_id = Ulid::new().to_string();
    let path_for_import = path.clone();
    let id_for_import = paper_id.clone();
    let library_for_import = library.clone();
    let imported = tokio::task::spawn_blocking(move || {
        import_pdf_file(&path_for_import, &id_for_import, &library_for_import)
    })
    .await
    .map_err(|e| pdf_failure(&path, e.to_string()))?
    .map_err(|e| pdf_failure(&path, e.to_string()))?;

    let mut draft = imported.draft;
    if draft.title == "(untitled)" || draft.title.is_empty() {
        if let Some((h_title, h_authors, h_year)) = parse_filename_heuristic(&path) {
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

    let existing = existing_paper_for_draft(&repo, &draft)
        .await
        .map_err(|e| pdf_failure(&path, e.to_string()))?;
    let mut paper = draft.into_paper();
    paper.id = paper_id;
    paper.pdf_path = Some(imported.stored_path.display().to_string());
    paper.bibtex = Some(generate_bibtex(&paper));

    if let Some(existing) = existing {
        attach_imported_pdf_to_existing(&repo, &library, &existing, &imported.stored_path)
            .await
            .map_err(|e| pdf_failure(&path, e.to_string()))
    } else {
        repo.insert(&paper)
            .await
            .map_err(|e| pdf_failure(&path, e.to_string()))?;
        Ok(paper)
    }
}

fn pdf_failure(path: &Path, error: String) -> PdfFailure {
    PdfFailure {
        path: path.display().to_string(),
        error,
    }
}

/// Recursively walk a directory and collect all .pdf file paths.
fn walk_pdfs(dir: &PathBuf) -> Vec<PathBuf> {
    let mut result = Vec::new();
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                result.extend(walk_pdfs(&path));
            } else if path
                .extension()
                .is_some_and(|e| e.eq_ignore_ascii_case("pdf"))
            {
                result.push(path);
            }
        }
    }
    result
}

/// Try to extract metadata from a filename like `Author_Year_Title.pdf` or
/// `Author - Year - Title.pdf` or `Author (Year) Title.pdf`.
fn parse_filename_heuristic(path: &Path) -> Option<(String, Vec<String>, Option<i32>)> {
    let stem = path.file_stem()?.to_string_lossy().to_string();

    // Pattern: Author_Year_Title  or  Author - Year - Title
    let sep_re = regex::Regex::new(r"[_\s]*[-–]\s*|_").ok()?;
    let parts: Vec<&str> = sep_re.splitn(&stem, 3).collect();
    if parts.len() >= 3 {
        let year = parts[1].trim().parse::<i32>().ok();
        if year.is_some() {
            let authors: Vec<String> = parts[0]
                .split(['&', ','])
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();
            let title = parts[2].replace('_', " ").trim().to_string();
            return Some((title, authors, year));
        }
    }

    let paren_re = regex::Regex::new(r"^(.+?)\s*\((\d{4})\)\s*(.+)$").ok()?;
    if let Some(caps) = paren_re.captures(&stem) {
        let author_str = caps.get(1)?.as_str();
        let year = caps.get(2)?.as_str().parse::<i32>().ok();
        let title = caps.get(3)?.as_str().replace('_', " ").trim().to_string();
        let authors: Vec<String> = author_str
            .split(['&', ','])
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        return Some((title, authors, year));
    }

    let year_title_re = regex::Regex::new(r"^(\d{4})[_\s]+(.+)$").ok()?;
    if let Some(caps) = year_title_re.captures(&stem) {
        let year = caps.get(1)?.as_str().parse::<i32>().ok();
        let title = caps.get(2)?.as_str().replace('_', " ").trim().to_string();
        return Some((title, Vec::new(), year));
    }

    None
}
