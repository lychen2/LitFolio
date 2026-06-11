use anyhow::Result;
use serde::Serialize;
use sqlx::Row;

use super::escape_fts;
use crate::storage::db::Pool;

/// A single search result from any source.
#[derive(Debug, Clone, Serialize)]
pub struct UnifiedSearchResult {
    /// "paper", "highlight", or "term"
    pub source: String,
    /// The paper ID this result belongs to.
    pub paper_id: String,
    /// Paper title (for display).
    pub paper_title: String,
    /// Matching snippet with context.
    pub snippet: String,
    /// Relevance score (lower = more relevant for bm25).
    pub score: f64,
}

/// Search across papers, highlights, and terms FTS tables.
/// Returns results grouped by source, sorted by relevance.
/// Each table query is independent — a failure in one table does not
/// block the other two.
pub async fn unified_search(
    pool: &Pool,
    query: &str,
    limit: i64,
) -> Result<Vec<UnifiedSearchResult>> {
    let escaped = escape_fts(query);
    if escaped.is_empty() {
        return Ok(vec![]);
    }

    let mut results = Vec::new();
    append_paper_results(pool, &escaped, limit, &mut results).await;
    append_document_results(pool, &escaped, limit, &mut results).await;
    append_highlight_results(pool, &escaped, limit, &mut results).await;
    append_term_results(pool, &escaped, limit, &mut results).await;

    results.sort_by(|a, b| {
        a.score
            .partial_cmp(&b.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    results.truncate(limit as usize);
    Ok(results)
}

async fn append_document_results(
    pool: &Pool,
    escaped: &str,
    limit: i64,
    results: &mut Vec<UnifiedSearchResult>,
) {
    let rows = sqlx::query(
        "SELECT d.paper_id, p.title as paper_title, bm25(paper_documents_fts) as score,
                snippet(paper_documents_fts, 1, '>>>', '<<<', '…', 80) as snip_markdown
         FROM paper_documents_fts f
         JOIN paper_documents d ON f.rowid = d.rowid
         JOIN papers p ON d.paper_id = p.id
         WHERE paper_documents_fts MATCH ?1
         ORDER BY bm25(paper_documents_fts)
         LIMIT ?2",
    )
    .bind(escaped)
    .bind(limit)
    .fetch_all(pool)
    .await;

    if let Ok(rows) = rows {
        for row in rows {
            results.push(document_result(row));
        }
    }
}

async fn append_paper_results(
    pool: &Pool,
    escaped: &str,
    limit: i64,
    results: &mut Vec<UnifiedSearchResult>,
) {
    let rows = sqlx::query(
        "SELECT p.id, p.title, bm25(papers_fts) as score,
                snippet(papers_fts, 0, '>>>', '<<<', '…', 40) as snip_title,
                snippet(papers_fts, 2, '>>>', '<<<', '…', 60) as snip_abstract,
                snippet(papers_fts, 3, '>>>', '<<<', '…', 60) as snip_tldr
         FROM papers_fts f
         JOIN papers p ON f.rowid = p.rowid
         WHERE papers_fts MATCH ?1
         ORDER BY bm25(papers_fts)
         LIMIT ?2",
    )
    .bind(escaped)
    .bind(limit)
    .fetch_all(pool)
    .await;

    if let Ok(rows) = rows {
        for row in rows {
            results.push(paper_result(row));
        }
    }
}

async fn append_highlight_results(
    pool: &Pool,
    escaped: &str,
    limit: i64,
    results: &mut Vec<UnifiedSearchResult>,
) {
    let rows = sqlx::query(
        "SELECT h.paper_id, p.title as paper_title, bm25(highlights_fts) as score,
                snippet(highlights_fts, 0, '>>>', '<<<', '…', 60) as snip_text,
                snippet(highlights_fts, 1, '>>>', '<<<', '…', 60) as snip_note
         FROM highlights_fts f
         JOIN highlights h ON f.rowid = h.rowid
         JOIN papers p ON h.paper_id = p.id
         WHERE highlights_fts MATCH ?1
         ORDER BY bm25(highlights_fts)
         LIMIT ?2",
    )
    .bind(escaped)
    .bind(limit)
    .fetch_all(pool)
    .await;

    if let Ok(rows) = rows {
        for row in rows {
            results.push(highlight_result(row));
        }
    }
}

async fn append_term_results(
    pool: &Pool,
    escaped: &str,
    limit: i64,
    results: &mut Vec<UnifiedSearchResult>,
) {
    let rows = sqlx::query(
        "SELECT t.paper_id, p.title as paper_title, bm25(terms_fts) as score,
                snippet(terms_fts, 0, '>>>', '<<<', '…', 40) as snip_term,
                snippet(terms_fts, 1, '>>>', '<<<', '…', 60) as snip_def
         FROM terms_fts f
         JOIN paper_terms t ON f.rowid = t.rowid
         JOIN papers p ON t.paper_id = p.id
         WHERE terms_fts MATCH ?1
         ORDER BY bm25(terms_fts)
         LIMIT ?2",
    )
    .bind(escaped)
    .bind(limit)
    .fetch_all(pool)
    .await;

    if let Ok(rows) = rows {
        for row in rows {
            results.push(term_result(row));
        }
    }
}

fn document_result(row: sqlx::sqlite::SqliteRow) -> UnifiedSearchResult {
    UnifiedSearchResult {
        source: "document".into(),
        paper_id: row.try_get("paper_id").unwrap_or_default(),
        paper_title: row.try_get("paper_title").unwrap_or_default(),
        snippet: row.try_get("snip_markdown").unwrap_or_default(),
        score: row.try_get("score").unwrap_or(0.0),
    }
}

fn paper_result(row: sqlx::sqlite::SqliteRow) -> UnifiedSearchResult {
    let snip_title: String = row.try_get("snip_title").unwrap_or_default();
    let snip_abstract: String = row.try_get("snip_abstract").unwrap_or_default();
    let snip_tldr: String = row.try_get("snip_tldr").unwrap_or_default();
    let snippet = if snip_tldr.contains(">>>") {
        snip_tldr
    } else if snip_abstract.contains(">>>") {
        snip_abstract
    } else {
        snip_title
    };
    UnifiedSearchResult {
        source: "paper".into(),
        paper_id: row.try_get("id").unwrap_or_default(),
        paper_title: row.try_get("title").unwrap_or_default(),
        snippet,
        score: row.try_get("score").unwrap_or(0.0),
    }
}

fn highlight_result(row: sqlx::sqlite::SqliteRow) -> UnifiedSearchResult {
    let snip_text: String = row.try_get("snip_text").unwrap_or_default();
    let snip_note: String = row.try_get("snip_note").unwrap_or_default();
    let snippet = if snip_note.contains(">>>") {
        format!("{snip_text} — {snip_note}")
    } else {
        snip_text
    };
    UnifiedSearchResult {
        source: "highlight".into(),
        paper_id: row.try_get("paper_id").unwrap_or_default(),
        paper_title: row.try_get("paper_title").unwrap_or_default(),
        snippet,
        score: row.try_get("score").unwrap_or(0.0),
    }
}

fn term_result(row: sqlx::sqlite::SqliteRow) -> UnifiedSearchResult {
    let snip_term: String = row.try_get("snip_term").unwrap_or_default();
    let snip_def: String = row.try_get("snip_def").unwrap_or_default();
    UnifiedSearchResult {
        source: "term".into(),
        paper_id: row.try_get("paper_id").unwrap_or_default(),
        paper_title: row.try_get("paper_title").unwrap_or_default(),
        snippet: format!("{snip_term}: {snip_def}"),
        score: row.try_get("score").unwrap_or(0.0),
    }
}
