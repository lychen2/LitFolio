//! IPC command for library question answering (RAG).
//!
//! Retrieval pipeline:
//!   1. LLM-rewrite the user's natural-language question into English search
//!      terms when an Ask-capable profile is configured.
//!   2. For unpinned library Ask, route title matches, expanded-term strict FTS,
//!      expanded-term OR FTS, raw-question strict FTS, raw-question OR FTS, and
//!      Chinese fuzzy OR FTS into one candidate pool. Rank by route weights,
//!      multi-route hits, year, then added-at before packing answer sources.
//!   3. For @/pinned papers, skip library-wide hybrid retrieval. Treat the
//!      pinned ids as the corpus, scan their indexed Markdown full text, and
//!      pack the most relevant bounded snippets for the answer.
//!   4. Load user highlights per answer source so the LLM sees passages the user
//!      marked as important.
//!   5. Hand off to [`answer_library_question`] which packs everything into a
//!      bounded context and calls the LLM with a citation-strict prompt.

use std::sync::Arc;

use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::ai::{active_profile_for_task, load_config, AskLibraryResult, AskSource, TaskKind};
use crate::storage::{knowledge, AskSession, AskSessionDraft, AskSessionRepo, PaperDocumentRepo};
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

#[derive(Debug, Serialize)]
pub struct AskCapabilityState {
    pub state: String,
    pub has_model: bool,
    pub indexed_documents: i64,
    pub failed_documents: i64,
    pub total_documents: i64,
    pub reason: Option<String>,
}

#[tauri::command]
pub async fn ask_session_latest(
    state: State<'_, Arc<AppState>>,
    project_id: Option<i64>,
) -> Result<Option<AskSession>, String> {
    AskSessionRepo::new(&state.pool)
        .latest(project_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ask_session_save(
    state: State<'_, Arc<AppState>>,
    draft: AskSessionDraft,
) -> Result<AskSession, String> {
    AskSessionRepo::new(&state.pool)
        .save(draft)
        .await
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn ask_capability_state(
    state: State<'_, Arc<AppState>>,
) -> Result<AskCapabilityState, String> {
    let cfg = load_config(&state.paths).map_err(|e| e.to_string())?;
    let model_result = active_profile_for_task(&cfg, TaskKind::Ask);
    let counts = PaperDocumentRepo::new(&state.pool)
        .index_counts()
        .await
        .map_err(|e| e.to_string())?;
    let has_model = model_result.is_ok();
    let reason = model_result.err().map(|e| e.to_string());
    let state_name = if !has_model && counts.indexed > 0 {
        "search_only"
    } else if !has_model {
        "needs_model"
    } else if counts.failed > 0 {
        "degraded"
    } else if counts.total == 0 {
        "indexing"
    } else {
        "answer_ready"
    };

    Ok(AskCapabilityState {
        state: state_name.into(),
        has_model,
        indexed_documents: counts.indexed,
        failed_documents: counts.failed,
        total_documents: counts.total,
        reason,
    })
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
    use super::notes::{
        normalize_limit, note_slug, render_note, DEFAULT_SOURCE_LIMIT, MAX_SOURCE_LIMIT,
    };
    use super::SaveAskNoteInput;
    use crate::ai::AskSource;

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

    #[test]
    fn render_note_includes_question_answer_terms_and_sources() {
        let input = SaveAskNoteInput {
            question: "What is contrastive retrieval?".into(),
            answer: "It's a learned retrieval method.".into(),
            terms: vec!["contrastive".into(), "retrieval".into()],
            sources: vec![AskSource {
                paper_id: "p1".into(),
                title: "Source Paper".into(),
                year: Some(2024),
                authors: vec!["Author".into()],
                snippet: "Method: contrastive learning.".into(),
            }],
            model: "gpt-4o".into(),
        };

        let note = render_note(&input, "2026-06-18 12:00 UTC".into());

        assert!(note.contains("# AI 问答笔记"));
        assert!(note.contains("- 模型: gpt-4o"));
        assert!(note.contains("- 检索词: contrastive · retrieval"));
        assert!(note.contains("## 问题\n\nWhat is contrastive retrieval?"));
        assert!(note.contains("## 结论\n\nIt's a learned retrieval method."));
        assert!(note.contains("### [1] Source Paper"));
        assert!(note.contains("Method: contrastive learning."));
    }
}
