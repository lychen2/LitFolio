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
    import_pdf_files_inner(state.inner().as_ref(), paths).await
}

async fn import_pdf_files_inner(
    state: &AppState,
    paths: Vec<String>,
) -> Result<PdfImportSummary, String> {
    let library = state.paths.clone();
    let http = state.http.clone();
    let repo = PaperRepo::new(&state.pool);
    let context = ImportContext {
        repo: &repo,
        library: &library,
        http: &http,
    };
    let mut imported = Vec::new();
    let mut failed = Vec::new();
    for p in paths {
        let path = PathBuf::from(&p);
        let canon_source = match validate_pdf_source(&library, &path) {
            Ok(canon_source) => canon_source,
            Err(error) => {
                failed.push(PdfFailure { path: p, error });
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
                let result = context.store_imported_pdf(paper_id, r).await;
                match result {
                    Ok(paper) => imported.push(paper),
                    Err(error) => failed.push(PdfFailure { path: p, error }),
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

struct ImportContext<'a> {
    repo: &'a PaperRepo<'a>,
    library: &'a crate::storage::LibraryPaths,
    http: &'a reqwest::Client,
}

impl ImportContext<'_> {
    async fn store_imported_pdf(
        &self,
        paper_id: String,
        result: crate::ingest::PdfImportResult,
    ) -> Result<crate::storage::Paper, String> {
        let mut draft = result.draft;
        enrich_draft_from_doi(self.http, &mut draft).await;
        let existing = existing_paper_for_draft(self.repo, &draft)
            .await
            .map_err(|e| e.to_string())?;
        let mut paper = draft.into_paper();
        paper.id = paper_id;
        paper.pdf_path = Some(result.stored_path.display().to_string());
        paper.bibtex = Some(generate_bibtex(&paper));
        if let Some(existing) = existing {
            return attach_imported_pdf_to_existing(
                self.repo,
                self.library,
                &existing,
                &result.stored_path,
            )
            .await
            .map_err(|e| e.to_string());
        }
        self.repo.insert(&paper).await.map_err(|e| e.to_string())?;
        Ok(paper)
    }
}

fn validate_pdf_source(
    library: &crate::storage::LibraryPaths,
    path: &std::path::Path,
) -> Result<PathBuf, String> {
    library
        .validate_external_pdf(path)
        .map_err(|e| e.to_string())
}

async fn enrich_draft_from_doi(http: &reqwest::Client, draft: &mut crate::ingest::PaperDraft) {
    let Some(ref doi) = draft.doi else {
        return;
    };
    let Ok(crossref) = fetch_doi(http, doi).await else {
        return;
    };
    if !crossref.title.is_empty() && crossref.title != "(untitled)" {
        draft.title = crossref.title;
    }
    if !crossref.authors.is_empty() {
        draft.authors = crossref.authors;
    }
    draft.year = crossref.year.or(draft.year);
    draft.venue = crossref.venue.or_else(|| draft.venue.take());
    draft.abstract_text = crossref
        .abstract_text
        .or_else(|| draft.abstract_text.take());
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::{open_pool, run_migrations, LibraryPaths};
    use tokio::sync::Mutex as AsyncMutex;
    use tokio_util::sync::CancellationToken;

    #[tokio::test]
    async fn import_pdf_files_inner_imports_valid_pdf_and_reports_invalid_source() {
        let (state, library_root, source_root) = test_state().await;
        let good_pdf = source_root.join("paper.pdf");
        let bad_pdf = source_root.join("not-pdf.pdf");
        std::fs::write(&good_pdf, b"%PDF-1.4\n%fixture\n%%EOF\n").unwrap();
        std::fs::write(&bad_pdf, b"not a pdf").unwrap();

        let summary = import_pdf_files_inner(
            &state,
            vec![
                good_pdf.to_string_lossy().into_owned(),
                bad_pdf.to_string_lossy().into_owned(),
            ],
        )
        .await
        .unwrap();

        assert_eq!(summary.imported.len(), 1);
        assert_eq!(summary.failed.len(), 1);
        assert!(summary.imported[0]
            .pdf_path
            .as_deref()
            .unwrap()
            .starts_with(library_root.to_str().unwrap()));
        assert!(summary.failed[0].error.contains("%PDF- header"));
        state.pool.close().await;
        std::fs::remove_dir_all(library_root).ok();
        std::fs::remove_dir_all(source_root).ok();
    }

    async fn test_state() -> (AppState, std::path::PathBuf, std::path::PathBuf) {
        let library_root = std::env::temp_dir().join(format!("litera-import-it-{}", Ulid::new()));
        let source_root = std::env::temp_dir().join(format!("litera-import-src-{}", Ulid::new()));
        std::fs::create_dir_all(&library_root).unwrap();
        std::fs::create_dir_all(&source_root).unwrap();
        let pool = open_pool(&library_root.join("library.sqlite"))
            .await
            .unwrap();
        run_migrations(&pool).await.unwrap();
        let state = AppState {
            pool,
            paths: LibraryPaths::new(&library_root),
            http: reqwest::Client::new(),
            http_external: reqwest::Client::new(),
            batch_cancel: AsyncMutex::new(None::<CancellationToken>),
            sync_lock: AsyncMutex::new(()),
        };
        (state, library_root, source_root)
    }
}
