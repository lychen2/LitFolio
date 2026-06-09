use std::path::Path;

use crate::ai::load_config;
use crate::ingest::PaperDraft;
use crate::mineru::{MineruClient, PdfMarkdownEngine};
use crate::storage::{LibraryPaths, Paper, PaperDocumentRepo, PaperRepo, Pool};

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

pub async fn generate_and_index_pdf_markdown(
    pool: &Pool,
    paths: &LibraryPaths,
    http: &reqwest::Client,
    paper_id: &str,
    pdf_path: &Path,
) -> anyhow::Result<()> {
    let canonical = paths.ensure_inside_root(pdf_path)?;
    let markdown = markdown_for_configured_engine(paths, http, &canonical, paper_id).await?;
    let trimmed = markdown.trim();
    paths.write_paper_markdown(paper_id, trimmed)?;
    PaperDocumentRepo::new(pool)
        .upsert_markdown(paper_id, trimmed)
        .await?;
    Ok(())
}

async fn markdown_for_configured_engine(
    paths: &LibraryPaths,
    http: &reqwest::Client,
    pdf_path: &Path,
    paper_id: &str,
) -> anyhow::Result<String> {
    let config = match load_config(paths) {
        Ok(config) => config.pdf_markdown,
        Err(error) => {
            tracing::warn!(paper_id, error = %error, "failed to load PDF Markdown engine config; using local engine");
            return extract_local_markdown(pdf_path).await;
        }
    };
    match config.engine {
        PdfMarkdownEngine::Local => extract_local_markdown(pdf_path).await,
        PdfMarkdownEngine::MineruAgent => {
            match MineruClient::new(http.clone())
                .parse_agent_file(pdf_path)
                .await
            {
                Ok(markdown) => Ok(markdown),
                Err(error) => {
                    tracing::warn!(paper_id, error = %error, "MinerU Agent PDF Markdown conversion failed; falling back to local engine");
                    extract_local_markdown(pdf_path).await
                }
            }
        }
        PdfMarkdownEngine::MineruPrecise => {
            match MineruClient::new(http.clone())
                .parse_precise_file(pdf_path, &config.mineru_token)
                .await
            {
                Ok(markdown) => Ok(markdown),
                Err(error) => {
                    tracing::warn!(paper_id, error = %error, "MinerU precise PDF Markdown conversion failed; falling back to local engine");
                    extract_local_markdown(pdf_path).await
                }
            }
        }
    }
}

async fn extract_local_markdown(pdf_path: &Path) -> anyhow::Result<String> {
    let canonical = pdf_path.to_path_buf();
    tokio::task::spawn_blocking(move || crate::ingest::extract_markdown_from_path(&canonical))
        .await?
}

pub async fn generate_and_index_pdf_markdown_or_warn(
    pool: &Pool,
    paths: &LibraryPaths,
    http: &reqwest::Client,
    paper_id: &str,
    pdf_path: &Path,
) {
    if let Err(error) = generate_and_index_pdf_markdown(pool, paths, http, paper_id, pdf_path).await
    {
        tracing::warn!(
            paper_id,
            pdf_path = %pdf_path.display(),
            error = %error,
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
