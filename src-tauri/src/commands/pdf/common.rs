use std::path::Path;

use crate::ingest::PaperDraft;
use crate::storage::{LibraryPaths, Paper, PaperDocumentRepo, PaperRepo, Pool};

#[derive(serde::Serialize)]
pub struct PdfImportSummary {
    pub imported: Vec<Paper>,
    pub failed: Vec<PdfFailure>,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct PdfFailure {
    pub path: String,
    pub error: String,
}

pub fn log_pdf_import_summary(
    import_source: &'static str,
    imported_count: usize,
    failed: &[PdfFailure],
) {
    for failure in failed {
        tracing::warn!(
            import_source,
            path = %failure.path,
            failure_reason = %failure.error,
            "PDF import item failed"
        );
    }
    tracing::info!(
        import_source,
        imported_count,
        failed_count = failed.len(),
        "PDF import completed"
    );
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

pub async fn generate_and_index_pdf_markdown(
    pool: &Pool,
    paths: &LibraryPaths,
    paper_id: &str,
    pdf_path: &Path,
) -> anyhow::Result<()> {
    let canonical = paths.ensure_inside_root(pdf_path)?;
    let markdown = extract_local_markdown(&canonical).await?;
    let trimmed = markdown.trim();
    paths.write_paper_markdown(paper_id, trimmed)?;
    PaperDocumentRepo::new(pool)
        .upsert_markdown(paper_id, trimmed)
        .await?;
    Ok(())
}

async fn extract_local_markdown(pdf_path: &Path) -> anyhow::Result<String> {
    let canonical = pdf_path.to_path_buf();
    tokio::task::spawn_blocking(move || crate::ingest::extract_markdown_from_path(&canonical))
        .await?
}

pub async fn generate_and_index_pdf_markdown_or_warn(
    pool: &Pool,
    paths: &LibraryPaths,
    paper_id: &str,
    pdf_path: &Path,
) {
    if let Err(error) = generate_and_index_pdf_markdown(pool, paths, paper_id, pdf_path).await {
        let error_message = error.to_string();
        if let Err(status_error) = PaperDocumentRepo::new(pool)
            .mark_index_failed(paper_id, &error_message)
            .await
        {
            tracing::warn!(
                paper_id,
                status_error = %status_error,
                "failed to persist PDF markdown indexing failure status"
            );
        }
        tracing::warn!(
            paper_id,
            pdf_path = %pdf_path.display(),
            error = %error_message,
            "failed to auto-generate markdown for imported PDF"
        );
    }
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
