use std::collections::HashMap;

use crate::ai::{
    active_profile_for_task, answer_library_question, empty_result, AskLibraryResult, ChatMessage,
    LlmProfile, TaskKind,
};
use crate::storage::{Highlight, HighlightRepo, Paper, PaperRepo};
use crate::AppState;

use super::notes::normalize_limit;
use super::search_flow::{retrieve_papers, RetrievalRequest};
use super::ConversationMessage;

pub(super) struct LibraryAskInput {
    pub question: String,
    pub limit: Option<i64>,
    pub conversation_history: Option<Vec<ConversationMessage>>,
    pub pinned_paper_ids: Option<Vec<String>>,
}

struct AnswerRequest<'a> {
    profile: &'a LlmProfile,
    question: &'a str,
    papers: &'a [Paper],
    highlights: &'a HashMap<String, Vec<Highlight>>,
    terms: &'a [String],
    history: &'a [ChatMessage],
}

pub(super) async fn run(
    state: &AppState,
    input: LibraryAskInput,
) -> Result<AskLibraryResult, String> {
    let question = normalize_question(&input.question)?;
    let cfg = crate::ai::load_config(&state.paths).map_err(|e| e.to_string())?;
    let profile = active_profile_for_task(&cfg, TaskKind::Ask).map_err(|e| e.to_string())?;
    let history = to_ai_history(input.conversation_history.unwrap_or_default());
    let repo = PaperRepo::new(&state.pool);
    let pinned_ids = normalize_pinned_ids(input.pinned_paper_ids);

    if !pinned_ids.is_empty() {
        return answer_pinned(
            state,
            &repo,
            PinnedAnswerRequest {
                profile: &profile,
                question: &question,
                history: &history,
                pinned_ids: &pinned_ids,
            },
        )
        .await;
    }

    let limit = normalize_limit(input.limit);
    let retrieved = retrieve_papers(
        state,
        &repo,
        RetrievalRequest {
            profile: &profile,
            question: &question,
            limit,
        },
    )
    .await;
    if retrieved.papers.is_empty() {
        return Ok(empty_result(retrieved.used_terms));
    }
    let highlights = load_highlights(state, &retrieved.papers).await;
    answer(
        state,
        AnswerRequest {
            profile: &profile,
            question: &question,
            papers: &retrieved.papers,
            highlights: &highlights,
            terms: &retrieved.used_terms,
            history: &history,
        },
    )
    .await
}

async fn answer_pinned(
    state: &AppState,
    repo: &PaperRepo<'_>,
    request: PinnedAnswerRequest<'_>,
) -> Result<AskLibraryResult, String> {
    let papers = load_pinned_papers(repo, request.pinned_ids).await?;
    let highlights = load_highlights(state, &papers).await;
    let terms: Vec<String> = Vec::new();
    answer(
        state,
        AnswerRequest {
            profile: request.profile,
            question: request.question,
            papers: &papers,
            highlights: &highlights,
            terms: &terms,
            history: request.history,
        },
    )
    .await
}

struct PinnedAnswerRequest<'a> {
    profile: &'a LlmProfile,
    question: &'a str,
    history: &'a [ChatMessage],
    pinned_ids: &'a [String],
}

async fn answer(state: &AppState, request: AnswerRequest<'_>) -> Result<AskLibraryResult, String> {
    answer_library_question(
        &state.http,
        request.profile,
        request.question,
        request.papers,
        request.highlights,
        request.terms,
        request.history,
    )
    .await
    .map_err(|e| e.to_string())
}

async fn load_pinned_papers(
    repo: &PaperRepo<'_>,
    pinned_ids: &[String],
) -> Result<Vec<Paper>, String> {
    let mut papers = Vec::with_capacity(pinned_ids.len());
    for id in pinned_ids {
        match repo.get(id).await {
            Ok(Some(p)) => papers.push(p),
            Ok(None) => tracing::warn!(paper_id = %id, "pinned paper not found; skipping"),
            Err(e) => tracing::warn!(paper_id = %id, error = %e, "pinned paper load failed"),
        }
    }
    if papers.is_empty() {
        return Err("pinned papers not found".into());
    }
    Ok(papers)
}

async fn load_highlights(state: &AppState, papers: &[Paper]) -> HashMap<String, Vec<Highlight>> {
    let highlight_repo = HighlightRepo::new(&state.pool);
    let mut highlights = HashMap::new();
    for p in papers {
        if let Ok(hs) = highlight_repo.list_by_paper(&p.id).await {
            if !hs.is_empty() {
                highlights.insert(p.id.clone(), hs);
            }
        }
    }
    highlights
}

fn normalize_question(question: &str) -> Result<String, String> {
    let trimmed = question.trim().to_string();
    if trimmed.is_empty() {
        return Err("empty question".into());
    }
    Ok(trimmed)
}

fn normalize_pinned_ids(ids: Option<Vec<String>>) -> Vec<String> {
    ids.unwrap_or_default()
        .into_iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

fn to_ai_history(history: Vec<ConversationMessage>) -> Vec<ChatMessage> {
    history
        .iter()
        .map(|m| ChatMessage {
            role: m.role.clone(),
            content: m.content.clone(),
        })
        .collect()
}
