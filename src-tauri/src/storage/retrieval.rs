//! Centralized full-text search and retrieval helpers.
//!
//! Consolidates FTS5 query building, paper search, multi-term Ask retrieval,
//! and unified cross-source search that were previously scattered across
//! `papers.rs`, `search.rs`, and `commands/ask.rs`.

use std::collections::HashMap;

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
    let rows = sqlx::query(
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
    rows.into_iter().map(super::papers::row_to_paper).collect()
}

/// Same as `search_papers`, but for an OR-joined FTS5 MATCH expression.
pub async fn search_papers_or(pool: &Pool, escaped: &str, limit: i64) -> Result<Vec<Paper>> {
    let rows = sqlx::query(
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
    rows.into_iter().map(super::papers::row_to_paper).collect()
}

// ── Multi-term Ask retrieval ───────────────────────────────────────────

/// Fan out per-term FTS5 searches and merge by paper_id. Score = number of
/// distinct terms that retrieved a given paper; ties broken by year DESC
/// then added_at DESC. This gives "papers that match many of the
/// LLM-rewritten terms" priority over "papers that happened to score high
/// in one term's bm25".
pub async fn search_papers_multi_term(pool: &Pool, terms: &[String], limit: i64) -> Vec<Paper> {
    let per_term_limit = (limit * 3).max(8);
    let mut scored: HashMap<String, (Paper, u32)> = HashMap::new();
    for term in terms {
        let term = term.trim();
        if term.is_empty() {
            continue;
        }
        let escaped = escape_fts(term);
        if escaped.is_empty() {
            continue;
        }
        let hits = search_papers(pool, &escaped, per_term_limit)
            .await
            .unwrap_or_default();
        for p in hits {
            scored
                .entry(p.id.clone())
                .and_modify(|(_, s)| *s += 1)
                .or_insert((p, 1));
        }
    }
    let mut entries: Vec<(Paper, u32)> = scored.into_values().collect();
    entries.sort_by(|a, b| {
        b.1.cmp(&a.1)
            .then_with(|| b.0.year.unwrap_or(0).cmp(&a.0.year.unwrap_or(0)))
            .then_with(|| b.0.added_at.cmp(&a.0.added_at))
    });
    entries
        .into_iter()
        .take(limit as usize)
        .map(|(p, _)| p)
        .collect()
}
