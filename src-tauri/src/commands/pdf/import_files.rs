use std::path::PathBuf;
use std::sync::Arc;

use tauri::State;
use ulid::Ulid;

use super::common::{
    attach_imported_pdf_to_existing, existing_paper_for_draft, PdfFailure, PdfImportSummary,
};
use crate::bibtex::generate_bibtex;
use crate::ingest::{fetch_doi, import_pdf_file};
use crate::storage::PaperRepo;
use crate::AppState;

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
        // Validate before launching the blocking task: rejects /etc/passwd,
        // non-PDFs, files renamed to look like PDFs, and sources that already
        // live inside the library. We pass the canonical source onward.
        let canon_source = match library.validate_external_pdf(&path) {
            Ok(c) => c,
            Err(e) => {
                failed.push(PdfFailure {
                    path: p,
                    error: e.to_string(),
                });
                continue;
            }
        };
        let paper_id = Ulid::new().to_string();
        let library_clone = library.clone();
        let id_clone = paper_id.clone();
        let result = tokio::task::spawn_blocking(move || {
            import_pdf_file(&canon_source, &id_clone, &library_clone)
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
                let existing = match existing_paper_for_draft(&repo, &draft).await {
                    Ok(existing) => existing,
                    Err(e) => {
                        failed.push(PdfFailure {
                            path: p,
                            error: e.to_string(),
                        });
                        continue;
                    }
                };
                let mut paper = draft.into_paper();
                paper.id = paper_id;
                paper.pdf_path = Some(r.stored_path.display().to_string());
                paper.bibtex = Some(generate_bibtex(&paper));
                if let Some(existing) = existing {
                    match attach_imported_pdf_to_existing(
                        &repo,
                        &library,
                        &existing,
                        &r.stored_path,
                    )
                    .await
                    {
                        Ok(updated) => imported.push(updated),
                        Err(e) => failed.push(PdfFailure {
                            path: p,
                            error: e.to_string(),
                        }),
                    }
                } else if let Err(e) = repo.insert(&paper).await {
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
