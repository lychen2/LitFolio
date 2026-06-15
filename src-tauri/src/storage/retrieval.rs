//! Centralized full-text search and retrieval helpers.
//!
//! Consolidates FTS5 query building, Ask retrieval support, and unified
//! cross-source search that were previously scattered across
//! `papers.rs`, `search.rs`, and `commands/ask.rs`.

use anyhow::{Context, Result};

use super::db::Pool;
use super::models::Paper;

mod fts;
mod unified;

pub use fts::{escape_fts, escape_fts_or};
pub use unified::{unified_search, UnifiedSearchResult};

/// Run a papers FTS5 query with a pre-escaped MATCH expression.
/// Errors are propagated to the caller (no empty-query fallback here —
/// callers that need one should check before calling).
pub async fn search_papers(pool: &Pool, escaped: &str, limit: i64) -> Result<Vec<Paper>> {
    let metadata = sqlx::query(
        "SELECT p.* FROM papers p
         JOIN papers_fts f ON f.rowid = p.rowid
         WHERE papers_fts MATCH ?1
         ORDER BY bm25(papers_fts), p.added_at DESC
         LIMIT ?2",
    )
    .bind(escaped)
    .bind(limit)
    .fetch_all(pool)
    .await
    .with_context(|| format!("search papers query={escaped}"))?;
    let mut papers = metadata
        .into_iter()
        .map(super::papers::row_to_paper)
        .collect::<Result<Vec<_>>>()?;
    append_document_hits(pool, escaped, limit, &mut papers).await?;
    papers.truncate(limit as usize);
    Ok(papers)
}

/// Same as `search_papers`, but for an OR-joined FTS5 MATCH expression.
pub async fn search_papers_or(pool: &Pool, escaped: &str, limit: i64) -> Result<Vec<Paper>> {
    let metadata = sqlx::query(
        "SELECT p.* FROM papers p
         JOIN papers_fts f ON f.rowid = p.rowid
         WHERE papers_fts MATCH ?1
         ORDER BY bm25(papers_fts), p.added_at DESC
         LIMIT ?2",
    )
    .bind(escaped)
    .bind(limit)
    .fetch_all(pool)
    .await
    .with_context(|| format!("search_or papers query={escaped}"))?;
    let mut papers = metadata
        .into_iter()
        .map(super::papers::row_to_paper)
        .collect::<Result<Vec<_>>>()?;
    append_document_hits(pool, escaped, limit, &mut papers).await?;
    papers.truncate(limit as usize);
    Ok(papers)
}

async fn append_document_hits(
    pool: &Pool,
    escaped: &str,
    limit: i64,
    papers: &mut Vec<Paper>,
) -> Result<()> {
    let rows = sqlx::query(
        "SELECT p.* FROM paper_documents_fts f
         JOIN paper_documents d ON f.rowid = d.rowid
         JOIN papers p ON d.paper_id = p.id
         WHERE paper_documents_fts MATCH ?1
         ORDER BY bm25(paper_documents_fts), p.added_at DESC
         LIMIT ?2",
    )
    .bind(escaped)
    .bind(limit)
    .fetch_all(pool)
    .await
    .with_context(|| format!("search document markdown query={escaped}"))?;

    for row in rows {
        let paper = super::papers::row_to_paper(row)?;
        if !papers.iter().any(|existing| existing.id == paper.id) {
            papers.push(paper);
        }
    }
    Ok(())
}
