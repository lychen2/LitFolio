//! Centralized full-text search and retrieval helpers.
//!
//! Consolidates FTS5 query building, paper search, multi-term Ask retrieval,
//! and unified cross-source search that were previously scattered across
//! `papers.rs`, `search.rs`, and `commands/ask.rs`.

use std::collections::HashMap;

use anyhow::{Context, Result};
use serde::Serialize;
use sqlx::Row;

use super::db::Pool;
use super::models::Paper;

// ── FTS5 query helpers ─────────────────────────────────────────────────

/// Strip the phrase-terminator double-quote and trim leading/trailing
/// punctuation that FTS5 still interprets as a tokenizer boundary even inside
/// quoted phrases. Internal `-`, `.`, `/` pass through unchanged — they're
/// valid inside an FTS5 phrase.
pub fn sanitize_fts_token(token: &str) -> String {
    token
        .chars()
        .filter(|c| *c != '"')
        .collect::<String>()
        .trim_matches(|c: char| matches!(c, '(' | ')' | ':' | ',' | ';' | '!' | '?'))
        .to_string()
}

/// Build an AND-joined FTS5 MATCH expression. Each whitespace-separated
/// token becomes a quoted prefix. Preserves research-domain tokens like
/// `BERT-base`, `R3.0`, `IEEE 802.11`.
pub fn escape_fts(input: &str) -> String {
    let pieces: Vec<String> = input
        .split_whitespace()
        .map(sanitize_fts_token)
        .filter(|s| !s.is_empty())
        .map(|s| format!("\"{s}\"*"))
        .collect();
    pieces.join(" AND ")
}

/// Build an OR-joined FTS5 MATCH expression for broader retrieval.
pub fn escape_fts_or(input: &str) -> String {
    let pieces: Vec<String> = input
        .split_whitespace()
        .map(sanitize_fts_token)
        .filter(|s| !s.is_empty())
        .map(|s| format!("\"{s}\"*"))
        .collect();
    pieces.join(" OR ")
}

// ── Paper search ───────────────────────────────────────────────────────

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

// ── Unified cross-source search ────────────────────────────────────────

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
    results.sort_by(|a, b| {
        a.score
            .partial_cmp(&b.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    results.truncate(limit as usize);

    Ok(results)
}

// ── Tests ──────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escape_fts_handles_empty_and_special() {
        assert_eq!(escape_fts(""), "");
        assert_eq!(escape_fts("   "), "");
        assert_eq!(escape_fts("foo bar"), "\"foo\"* AND \"bar\"*");
        assert_eq!(escape_fts("BERT-base"), "\"BERT-base\"*");
        assert_eq!(escape_fts("R3.0"), "\"R3.0\"*");
        assert_eq!(escape_fts("(foo)"), "\"foo\"*");
        assert_eq!(escape_fts("hi\"there"), "\"hithere\"*");
    }

    #[test]
    fn escape_fts_or_joins_with_or() {
        assert_eq!(escape_fts_or("a b"), "\"a\"* OR \"b\"*");
        assert_eq!(escape_fts_or(""), "");
    }

    #[test]
    fn sanitize_fts_token_preserves_internal_special() {
        assert_eq!(sanitize_fts_token("BERT-base"), "BERT-base");
        assert_eq!(sanitize_fts_token("IEEE 802.11"), "IEEE 802.11");
    }

    #[test]
    fn sanitize_fts_token_cleans_quotes_and_punctuation() {
        assert_eq!(sanitize_fts_token("\"hello\""), "hello");
        assert_eq!(sanitize_fts_token("(test:)"), "test");
        assert_eq!(sanitize_fts_token("foo,;!?"), "foo");
    }
}
