//! Current-paper question command (`reader_ask_paper`).
//!
//! Bounded, non-agentic core AI Reading: the host freezes an immutable
//! [`ReadingContextEnvelope`] containing ONLY this paper's verified refs,
//! active-revision provenance, and optional selection/highlight scope. The
//! provider sees exactly that context — no library retrieval, no embeddings,
//! no sessions, no tools, and no context widening or appending after freeze.

use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::ai::{
    active_reading_profile, chat_complete_with_task_kind, freeze_reading_context, load_config,
    ChatMessage, ReadingContextEnvelope, ReadingContextRequest, SelectionContext, TaskKind,
};
use crate::commands::ai_dispatch::run_reading_dispatch;
use crate::commands::reader_translate::load_paper;
use crate::storage::{PaperRepo, ProvenanceRepo};
use crate::AppState;

const MAX_QUESTION_CHARS: usize = 2_000;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReaderAskInput {
    pub request: ReadingContextRequest,
    pub question: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReaderAskResult {
    pub answer: String,
    pub model: String,
    pub envelope_id: String,
}

/// Verify the highlight ref belongs to the requested paper and return its
/// text/page for the selection scope. Cross-paper refs are rejected here —
/// before the envelope is frozen.
async fn resolve_highlight_scope(
    state: &AppState,
    paper_id: &str,
    highlight_id: &str,
) -> Result<SelectionContext, String> {
    let repo = crate::storage::HighlightRepo::new(&state.pool);
    let highlight = repo
        .get(highlight_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "highlight not found".to_string())?;
    if highlight.paper_id != paper_id {
        return Err(format!(
            "cross-paper-ref: highlight {} belongs to another paper",
            highlight.id
        ));
    }
    Ok(SelectionContext {
        text: highlight.text,
        page: Some(highlight.page),
    })
}

/// Build the bounded user prompt from the FROZEN envelope. Pure function of
/// the envelope + question; nothing else is read afterwards.
fn build_ask_messages(
    envelope: &ReadingContextEnvelope,
    question: &str,
) -> Vec<ChatMessage> {
    let mut sections = Vec::new();
    sections.push(format!("# {}\n", envelope.title));
    if let Some(abstract_text) = envelope.abstract_text.as_deref().filter(|s| !s.trim().is_empty())
    {
        sections.push(format!("## Abstract\n{abstract_text}\n"));
    }
    if let Some(body) = envelope.body_excerpt.as_deref() {
        let truncated = if envelope.body_truncated { " (truncated)" } else { "" };
        sections.push(format!("## Document text{truncated}\n{body}\n"));
    }
    if let Some(selection) = envelope.selection.as_ref() {
        sections.push(format!("## Selected passage\n{}\n", selection.text));
    }

    vec![
        ChatMessage {
            role: "system".into(),
            content: "\
You answer questions about ONE specific academic paper. Use ONLY the \
document context provided in this message. If the answer is not contained \
in the provided context, say so explicitly instead of guessing. Never cite \
or reference other papers from any library."
                .into(),
        },
        ChatMessage {
            role: "user".into(),
            content: format!("{}\n## Question\n{question}\n", sections.join("\n")),
        },
    ]
}

#[tauri::command]
pub async fn reader_ask_paper(
    state: State<'_, Arc<AppState>>,
    input: ReaderAskInput,
) -> Result<ReaderAskResult, String> {
    let question = input.question.trim();
    if question.is_empty() {
        return Err("empty question".into());
    }
    let question = question.chars().take(MAX_QUESTION_CHARS).collect::<String>();

    let paper_repo = PaperRepo::new(&state.pool);
    let paper = load_paper(&paper_repo, &input.request.paper_id.clone())
        .await
        .map_err(|e| e.to_string())?;

    // Resolve the selection scope BEFORE freezing: a highlight ref must be
    // verified against storage while it is still rejectable.
    let mut request = input.request;
    if let Some(highlight_id) = request.highlight_id.clone() {
        let scope = resolve_highlight_scope(&state, &request.paper_id, &highlight_id).await?;
        request.selection = Some(scope);
    }

    // Body text comes from the reader cache only — never a library-wide scan.
    let body = state.paths.read_pdf_text(&request.paper_id);

    let provenance = ProvenanceRepo::new(&state.pool);
    let active_revision = provenance
        .active_revision(&request.paper_id)
        .await
        .map_err(|e| e.to_string())?;
    let envelope = freeze_reading_context(
        &paper.id,
        &paper.title,
        paper.abstract_text.as_deref(),
        body.as_deref(),
        active_revision.as_ref(),
        &request,
    )
    .map_err(|e| format!("{}: {}", e.category(), e))?;

    let cfg = load_config(&state.paths).map_err(|e| e.to_string())?;
    let profile = active_reading_profile(&cfg).map_err(|e| e.to_string())?;
    let messages = build_ask_messages(&envelope, &question);

    run_reading_dispatch(
        &state,
        "reader_ask_paper",
        &paper.id,
        &profile.name,
        &profile.chat_model,
        &envelope,
        async {
            chat_complete_with_task_kind(
                &state.http,
                &profile,
                TaskKind::Ask.as_str(),
                &messages,
            )
            .await
            .map(|resp| ReaderAskResult {
                answer: resp.content,
                model: resp.model,
                envelope_id: envelope.envelope_id.clone(),
            })
        },
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn envelope(selection: Option<&str>, body: Option<&str>) -> ReadingContextEnvelope {
        ReadingContextEnvelope {
            envelope_id: "env-test".into(),
            paper_id: "p1".into(),
            revision_id: None,
            source_hash: None,
            parser_owner: None,
            selection: selection.map(|text| SelectionContext {
                text: text.into(),
                page: Some(1),
            }),
            highlight_id: None,
            title: "Paper Title".into(),
            abstract_text: Some("Abstract.".into()),
            body_excerpt: body.map(String::from),
            body_truncated: false,
            warnings: vec![],
        }
    }

    #[test]
    fn ask_prompt_contains_only_frozen_envelope_content() {
        let messages = build_ask_messages(&envelope(Some("sel"), Some("body")), "What is X?");
        assert_eq!(messages.len(), 2);
        let user = &messages[1].content;
        assert!(user.contains("Paper Title"));
        assert!(user.contains("body"));
        assert!(user.contains("sel"));
        assert!(user.contains("What is X?"));
    }

    #[test]
    fn empty_scope_falls_back_to_metadata_only() {
        let messages = build_ask_messages(&envelope(None, None), "q");
        let user = &messages[1].content;
        assert!(user.contains("Paper Title"));
        assert!(user.contains("Abstract."));
        assert!(!user.contains("Document text"));
        assert!(!user.contains("Selected passage"));
    }
}
