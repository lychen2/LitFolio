//! IPC command for library question answering (RAG).
//!
//! Retrieval pipeline:
//!   1. LLM-rewrite the user's natural-language question into 2-4 English search
//!      terms (via [`expand_search_query`]). This is load-bearing: feeding a raw
//!      Chinese question into FTS5's AND-of-tokens path is essentially 0-recall.
//!   2. Fan out per-term FTS5 searches, merge by paper_id, score by the number of
//!      terms that matched (higher == more on-topic), then by year and added-at.
//!   3. If the rewrite path returns nothing, fall back to a raw-question FTS5 hit.
//!   4. Load up to a few user highlights per retrieved paper so the LLM sees
//!      passages the user marked as important.
//!   5. Hand off to [`answer_library_question`] which packs everything into a
//!      bounded context and calls the LLM with a citation-strict prompt.

use std::collections::HashMap;
use std::sync::Arc;

use tauri::State;

use crate::ai::{
    active_profile_for_task, answer_library_question, empty_result, expand_search_query,
    load_config, AskLibraryResult, TaskKind,
};
use crate::storage::{HighlightRepo, Paper, PaperRepo};
use crate::AppState;

const DEFAULT_SOURCE_LIMIT: i64 = 8;
const MAX_SOURCE_LIMIT: i64 = 20;

#[tauri::command]
pub async fn library_ask(
    state: State<'_, Arc<AppState>>,
    question: String,
    limit: Option<i64>,
) -> Result<AskLibraryResult, String> {
    let trimmed = question.trim().to_string();
    if trimmed.is_empty() {
        return Err("empty question".into());
    }
    let cfg = load_config(&state.paths).map_err(|e| e.to_string())?;
    let profile = active_profile_for_task(&cfg, TaskKind::Ask).map_err(|e| e.to_string())?;
    let source_limit = normalize_limit(limit);
    let repo = PaperRepo::new(&state.pool);

    // Step 1: LLM query rewrite. Best-effort — if it fails (offline, key invalid,
    // model not configured), we still want retrieval to function.
    let expanded_terms = match expand_search_query(&state.http, &profile, &trimmed).await {
        Ok(eq) => eq.terms,
        Err(_) => Vec::new(),
    };

    // Step 2: multi-term retrieval; fall back to raw question when needed.
    let mut papers = if expanded_terms.is_empty() {
        repo.search(&trimmed, source_limit).await.unwrap_or_default()
    } else {
        multi_term_search(&repo, &expanded_terms, source_limit).await
    };
    let mut used_terms = if expanded_terms.is_empty() {
        vec![trimmed.clone()]
    } else {
        expanded_terms.clone()
    };
    if papers.is_empty() && !expanded_terms.is_empty() {
        // Expanded terms all missed — last-ditch raw-question pass.
        let raw_hits = repo.search(&trimmed, source_limit).await.unwrap_or_default();
        if !raw_hits.is_empty() {
            papers = raw_hits;
            used_terms.push(trimmed.clone());
        }
    }
    if papers.is_empty() {
        return Ok(empty_result(used_terms));
    }

    // Step 3: per-paper highlights for the snippet builder.
    let highlight_repo = HighlightRepo::new(&state.pool);
    let mut highlights = HashMap::new();
    for p in &papers {
        if let Ok(hs) = highlight_repo.list_by_paper(&p.id).await {
            if !hs.is_empty() {
                highlights.insert(p.id.clone(), hs);
            }
        }
    }

    answer_library_question(
        &state.http,
        &profile,
        &trimmed,
        &papers,
        &highlights,
        &used_terms,
    )
    .await
    .map_err(|e| e.to_string())
}

/// Fan out per-term FTS5 searches and merge by paper_id. Score = number of distinct
/// terms that retrieved a given paper; ties broken by year DESC then added_at DESC.
/// This gives "papers that match many of the LLM-rewritten terms" priority over
/// "papers that happened to score high in one term's bm25".
async fn multi_term_search(repo: &PaperRepo<'_>, terms: &[String], limit: i64) -> Vec<Paper> {
    // Over-fetch per term so the merge has enough candidates to surface multi-term
    // matches even when one term's bm25 ordering pushes them down.
    let per_term_limit = (limit * 3).max(8);
    let mut scored: HashMap<String, (Paper, u32)> = HashMap::new();
    for term in terms {
        let term = term.trim();
        if term.is_empty() {
            continue;
        }
        if let Ok(hits) = repo.search(term, per_term_limit).await {
            for p in hits {
                scored
                    .entry(p.id.clone())
                    .and_modify(|(_, s)| *s += 1)
                    .or_insert((p, 1));
            }
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

fn normalize_limit(limit: Option<i64>) -> i64 {
    limit
        .unwrap_or(DEFAULT_SOURCE_LIMIT)
        .clamp(1, MAX_SOURCE_LIMIT)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clamps_limit() {
        assert_eq!(normalize_limit(None), DEFAULT_SOURCE_LIMIT);
        assert_eq!(normalize_limit(Some(0)), 1);
        assert_eq!(normalize_limit(Some(99)), MAX_SOURCE_LIMIT);
    }
}
