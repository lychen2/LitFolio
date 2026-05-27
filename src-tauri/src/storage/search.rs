//! Unified full-text search across papers, highlights, and terms.

use anyhow::Result;
use serde::Serialize;
use sqlx::Row;

use super::db::Pool;

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

/// Sanitize raw user input for an FTS5 MATCH query.
fn escape_fts(input: &str) -> String {
    let terms: Vec<String> = input
        .split_whitespace()
        .map(|t| {
            t.chars()
                .filter(|c| c.is_alphanumeric() || *c == '"' || *c == '*' || *c == '-')
                .collect::<String>()
        })
        .filter(|t| !t.is_empty())
        .collect();
    if terms.is_empty() {
        return String::new();
    }
    terms.join(" ")
}

/// Search across papers, highlights, and terms FTS tables.
/// Returns results grouped by source, sorted by relevance.
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

    // Search papers.
    let paper_rows = sqlx::query(
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
    .bind(&escaped)
    .bind(limit)
    .fetch_all(pool)
    .await;

    if let Ok(rows) = paper_rows {
        for row in rows {
            let title: String = row.try_get("title").unwrap_or_default();
            let snip_title: String = row.try_get("snip_title").unwrap_or_default();
            let snip_abstract: String = row.try_get("snip_abstract").unwrap_or_default();
            let snip_tldr: String = row.try_get("snip_tldr").unwrap_or_default();
            // Pick the most relevant snippet.
            let snippet = if snip_tldr.contains(">>>") {
                snip_tldr
            } else if snip_abstract.contains(">>>") {
                snip_abstract
            } else {
                snip_title
            };
            results.push(UnifiedSearchResult {
                source: "paper".into(),
                paper_id: row.try_get("id").unwrap_or_default(),
                paper_title: title,
                snippet,
                score: row.try_get::<f64, _>("score").unwrap_or(0.0),
            });
        }
    }

    // Search highlights.
    let highlight_rows = sqlx::query(
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
    .bind(&escaped)
    .bind(limit)
    .fetch_all(pool)
    .await;

    if let Ok(rows) = highlight_rows {
        for row in rows {
            let snip_text: String = row.try_get("snip_text").unwrap_or_default();
            let snip_note: String = row.try_get("snip_note").unwrap_or_default();
            let snippet = if snip_note.contains(">>>") {
                format!("{} — {}", snip_text, snip_note)
            } else {
                snip_text
            };
            results.push(UnifiedSearchResult {
                source: "highlight".into(),
                paper_id: row.try_get("paper_id").unwrap_or_default(),
                paper_title: row.try_get("paper_title").unwrap_or_default(),
                snippet,
                score: row.try_get::<f64, _>("score").unwrap_or(0.0),
            });
        }
    }

    // Search terms.
    let term_rows = sqlx::query(
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
    .bind(&escaped)
    .bind(limit)
    .fetch_all(pool)
    .await;

    if let Ok(rows) = term_rows {
        for row in rows {
            let snip_term: String = row.try_get("snip_term").unwrap_or_default();
            let snip_def: String = row.try_get("snip_def").unwrap_or_default();
            let snippet = format!("{}: {}", snip_term, snip_def);
            results.push(UnifiedSearchResult {
                source: "term".into(),
                paper_id: row.try_get("paper_id").unwrap_or_default(),
                paper_title: row.try_get("paper_title").unwrap_or_default(),
                snippet,
                score: row.try_get::<f64, _>("score").unwrap_or(0.0),
            });
        }
    }

    // Sort by score (bm25 returns negative, lower = more relevant).
    results.sort_by(|a, b| a.score.partial_cmp(&b.score).unwrap_or(std::cmp::Ordering::Equal));
    results.truncate(limit as usize);

    Ok(results)
}
