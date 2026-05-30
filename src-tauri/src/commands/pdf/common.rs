use std::path::Path;

use crate::ingest::PaperDraft;
use crate::storage::{Paper, PaperRepo};

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

pub async fn attach_imported_pdf_to_existing(
    repo: &PaperRepo<'_>,
    paths: &crate::storage::LibraryPaths,
    existing: &Paper,
    imported_path: &Path,
) -> anyhow::Result<Paper> {
    let dest = paths.paper_dir(&existing.id).join("original.pdf");
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::copy(imported_path, &dest)?;
    let dest_str = dest.display().to_string();
    repo.update_pdf_path(&existing.id, &dest_str).await?;
    repo.get(&existing.id)
        .await?
        .ok_or_else(|| anyhow::anyhow!("paper vanished after pdf update"))
}

pub async fn existing_paper_for_draft(
    repo: &PaperRepo<'_>,
    draft: &PaperDraft,
) -> anyhow::Result<Option<Paper>> {
    if let Some(doi) = draft.doi.as_deref() {
        if let Some(existing) = repo.find_by_doi(doi).await? {
            return Ok(Some(existing));
        }
    }
    if let Some(arxiv_id) = draft.arxiv_id.as_deref() {
        if let Some(existing) = repo.find_by_arxiv_id(arxiv_id).await? {
            return Ok(Some(existing));
        }
    }
    Ok(None)
}
