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

use std::sync::Arc;

use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::ai::{AskLibraryResult, AskSource};
use crate::storage::knowledge;
use crate::AppState;

mod library;
mod notes;
mod search_flow;

use notes::{note_slug, render_note};

#[derive(Debug, Deserialize)]
pub struct SaveAskNoteInput {
    pub question: String,
    pub answer: String,
    pub terms: Vec<String>,
    pub sources: Vec<AskSource>,
    pub model: String,
}

#[derive(Debug, Serialize)]
pub struct SaveAskNoteResult {
    pub path: String,
}

#[derive(Debug, Deserialize)]
pub struct ConversationMessage {
    pub role: String,
    pub content: String,
}

#[tauri::command]
pub async fn library_ask(
    state: State<'_, Arc<AppState>>,
    question: String,
    limit: Option<i64>,
    conversation_history: Option<Vec<ConversationMessage>>,
    pinned_paper_ids: Option<Vec<String>>,
) -> Result<AskLibraryResult, String> {
    let input = library::LibraryAskInput {
        question,
        limit,
        conversation_history,
        pinned_paper_ids,
    };
    library::run(state.inner().as_ref(), input).await
}

#[tauri::command]
pub async fn ask_save_as_note(
    state: State<'_, Arc<AppState>>,
    input: SaveAskNoteInput,
) -> Result<SaveAskNoteResult, String> {
    let question = input.question.trim();
    let answer = input.answer.trim();
    if question.is_empty() {
        return Err("empty question".into());
    }
    if answer.is_empty() {
        return Err("empty answer".into());
    }
    let slug = note_slug(question);
    let content = render_note(&input, Utc::now().format("%Y-%m-%d %H:%M UTC").to_string());
    let path =
        knowledge::save_markdown(&state.paths, &slug, &content).map_err(|e| e.to_string())?;
    Ok(SaveAskNoteResult { path })
}

#[cfg(test)]
mod tests {
    use super::notes::{normalize_limit, note_slug, DEFAULT_SOURCE_LIMIT, MAX_SOURCE_LIMIT};

    #[test]
    fn clamps_limit() {
        assert_eq!(normalize_limit(None), DEFAULT_SOURCE_LIMIT);
        assert_eq!(normalize_limit(Some(0)), 1);
        assert_eq!(normalize_limit(Some(99)), MAX_SOURCE_LIMIT);
    }

    #[test]
    fn note_slug_falls_back() {
        let slug = note_slug("%%%");
        assert!(slug.contains("ask-note"));
    }
}
