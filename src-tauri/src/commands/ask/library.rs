use std::collections::{BTreeSet, HashMap};

use crate::ai::{
    active_profile_for_task, answer_library_question, empty_result, AskLibraryResult, ChatMessage,
    LibraryQuestionRequest, LlmProfile, TaskKind,
};
use crate::commands::pdf::common::generate_and_index_pdf_markdown_or_warn;
use crate::storage::{Highlight, HighlightRepo, Paper, PaperDocumentRepo, PaperRepo};
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
    document_snippets: &'a HashMap<String, String>,
    terms: &'a [String],
    history: &'a [ChatMessage],
}

const MAX_DOCUMENT_SNIPPET_CHARS: usize = 2_400;
const MAX_DOCUMENT_BLOCKS: usize = 4;

pub(super) async fn run(
    state: &AppState,
    input: LibraryAskInput,
) -> Result<AskLibraryResult, String> {
    let question = normalize_question(&input.question)?;
    let cfg = crate::ai::load_config(&state.paths).map_err(|e| e.to_string())?;
    let profile = active_profile_for_task(&cfg, TaskKind::Ask).map_err(|e| e.to_string())?;
    let history = to_ai_history(input.conversation_history.unwrap_or_default());
    let retrieval_question = retrieval_question(&question, &history);
    let repo = PaperRepo::new(&state.pool);
    let pinned_ids = normalize_pinned_ids(input.pinned_paper_ids);

    if !pinned_ids.is_empty() {
        return answer_pinned(
            state,
            &repo,
            PinnedAnswerRequest {
                profile: &profile,
                question: &question,
                retrieval_question: &retrieval_question,
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
            question: &retrieval_question,
            limit,
        },
    )
    .await;
    if retrieved.papers.is_empty() {
        return Ok(empty_result(retrieved.used_terms));
    }
    let highlights = load_highlights(state, &retrieved.papers).await;
    let document_snippets = load_document_snippets(
        state,
        &retrieved.papers,
        &snippet_terms(&retrieval_question, &retrieved.used_terms),
    )
    .await?;
    answer(
        state,
        AnswerRequest {
            profile: &profile,
            question: &question,
            papers: &retrieved.papers,
            highlights: &highlights,
            document_snippets: &document_snippets,
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
    let document_snippets = load_document_snippets(
        state,
        &papers,
        &snippet_terms(request.retrieval_question, &terms),
    )
    .await?;
    answer(
        state,
        AnswerRequest {
            profile: request.profile,
            question: request.question,
            papers: &papers,
            highlights: &highlights,
            document_snippets: &document_snippets,
            terms: &terms,
            history: request.history,
        },
    )
    .await
}

struct PinnedAnswerRequest<'a> {
    profile: &'a LlmProfile,
    question: &'a str,
    retrieval_question: &'a str,
    history: &'a [ChatMessage],
    pinned_ids: &'a [String],
}

async fn answer(state: &AppState, request: AnswerRequest<'_>) -> Result<AskLibraryResult, String> {
    answer_library_question(LibraryQuestionRequest {
        client: &state.http,
        profile: request.profile,
        question: request.question,
        papers: request.papers,
        highlights: request.highlights,
        document_snippets: request.document_snippets,
        terms: request.terms,
        conversation_history: request.history,
    })
    .await
    .map_err(|e| e.to_string())
}

async fn load_document_snippets(
    state: &AppState,
    papers: &[Paper],
    terms: &[String],
) -> Result<HashMap<String, String>, String> {
    let ids = papers
        .iter()
        .map(|paper| paper.id.clone())
        .collect::<Vec<_>>();
    let repo = PaperDocumentRepo::new(&state.pool);
    let mut docs = repo
        .markdown_for_papers(&ids)
        .await
        .map_err(|e| e.to_string())?;
    backfill_missing_document_markdown(state, papers, &docs).await;
    docs = PaperDocumentRepo::new(&state.pool)
        .markdown_for_papers(&ids)
        .await
        .map_err(|e| e.to_string())?;
    Ok(docs
        .into_iter()
        .filter_map(|(paper_id, markdown)| {
            relevant_markdown_snippet(&markdown, terms).map(|snippet| (paper_id, snippet))
        })
        .collect())
}

async fn backfill_missing_document_markdown(
    state: &AppState,
    papers: &[Paper],
    existing_docs: &HashMap<String, String>,
) {
    for paper in papers {
        if existing_docs.contains_key(&paper.id) {
            continue;
        }
        let Some(pdf_path) = paper
            .pdf_path
            .as_deref()
            .filter(|path| !path.trim().is_empty())
        else {
            continue;
        };
        generate_and_index_pdf_markdown_or_warn(
            &state.pool,
            &state.paths,
            &state.http,
            &paper.id,
            std::path::Path::new(pdf_path),
        )
        .await;
    }
}

fn snippet_terms(question: &str, terms: &[String]) -> Vec<String> {
    let mut out = terms
        .iter()
        .map(|term| term.trim().to_string())
        .filter(|term| !term.is_empty())
        .collect::<Vec<_>>();
    out.extend(
        question
            .split(|ch: char| ch.is_whitespace() || ch.is_ascii_punctuation())
            .map(str::trim)
            .filter(|term| term.chars().count() >= 3)
            .map(ToOwned::to_owned),
    );
    let question_lower = question.to_lowercase();
    if question.contains('图') || question_lower.contains("figure") {
        out.extend([
            "figure".to_string(),
            "fig".to_string(),
            "caption".to_string(),
        ]);
    }
    out.sort();
    out.dedup();
    out
}

fn relevant_markdown_snippet(markdown: &str, terms: &[String]) -> Option<String> {
    let query_terms = terms
        .iter()
        .map(|term| term.trim().to_lowercase())
        .filter(|term| !term.is_empty())
        .collect::<Vec<_>>();
    if query_terms.is_empty() {
        return first_markdown_blocks(markdown);
    }

    let blocks = markdown_blocks(markdown);
    let mut scored = blocks
        .iter()
        .enumerate()
        .filter_map(|(index, block)| {
            let score = block_score(block, &query_terms);
            (score > 0).then_some((index, score))
        })
        .collect::<Vec<_>>();
    if scored.is_empty() {
        return None;
    }
    scored.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));

    let mut selected = BTreeSet::new();
    for (index, _) in scored.into_iter().take(MAX_DOCUMENT_BLOCKS) {
        if index > 0 {
            selected.insert(index - 1);
        }
        selected.insert(index);
        if index + 1 < blocks.len() {
            selected.insert(index + 1);
        }
    }
    let text = selected
        .into_iter()
        .map(|index| blocks[index].as_str())
        .collect::<Vec<_>>()
        .join("\n\n");
    truncate_chars(&text, MAX_DOCUMENT_SNIPPET_CHARS)
}

fn first_markdown_blocks(markdown: &str) -> Option<String> {
    let text = markdown_blocks(markdown)
        .into_iter()
        .take(MAX_DOCUMENT_BLOCKS)
        .collect::<Vec<_>>()
        .join("\n\n");
    truncate_chars(&text, MAX_DOCUMENT_SNIPPET_CHARS)
}

fn markdown_blocks(markdown: &str) -> Vec<String> {
    markdown
        .split("\n\n")
        .map(str::trim)
        .filter(|block| !block.is_empty())
        .map(ToOwned::to_owned)
        .collect()
}

fn block_score(block: &str, terms: &[String]) -> usize {
    let haystack = block.to_lowercase();
    terms
        .iter()
        .map(|term| haystack.matches(term.as_str()).count())
        .sum()
}

fn truncate_chars(text: &str, max_chars: usize) -> Option<String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.chars().count() <= max_chars {
        return Some(trimmed.to_string());
    }
    let mut out = trimmed.chars().take(max_chars).collect::<String>();
    out.push_str("...");
    Some(out)
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

fn retrieval_question(current_question: &str, history: &[ChatMessage]) -> String {
    let mut prior_user_messages = history
        .iter()
        .rev()
        .filter(|message| message.role == "user")
        .take(2)
        .map(|message| message.content.trim())
        .filter(|content| !content.is_empty())
        .collect::<Vec<_>>();
    prior_user_messages.reverse();
    if prior_user_messages.is_empty() {
        return current_question.to_string();
    }
    format!(
        "Previous user context:\n{}\n\nCurrent question:\n{}",
        prior_user_messages.join("\n\n"),
        current_question
    )
}
