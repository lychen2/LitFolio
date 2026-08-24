mod explain;
mod terms;
mod translate;

use std::sync::Arc;

use anyhow::{anyhow, Result};
use chrono::Utc;
use tauri::State;

use crate::ai::{
    active_reading_profile, chat_complete_for_task, estimate_markdown_translation,
    freeze_reading_context, load_config, translate_markdown_text, ChatMessage, LlmProfile,
    MarkdownTranslationEstimate, MarkdownTranslationResult, ReadingContextEnvelope,
    ReadingContextRequest, SelectionContext, TaskKind, MARKDOWN_CHUNK_CHARS,
};
use crate::commands::ai_dispatch::run_reading_dispatch;
use crate::storage::{
    Highlight, HighlightRepo, HighlightSummaryUpdate, HighlightTranslationUpdate, Paper, PaperRepo,
    PaperTermRepo,
};
use crate::AppState;

use self::terms::build_term_insights;
pub use translate::ReaderTranslateResult;
use translate::{translate_selection, TranslateSelectionInput};

#[derive(Debug, Clone, serde::Serialize)]
pub struct ReaderMarkdownTranslationResult {
    pub markdown: String,
    pub target_lang: String,
    pub model: String,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub cached: bool,
}

impl From<MarkdownTranslationResult> for ReaderMarkdownTranslationResult {
    fn from(result: MarkdownTranslationResult) -> Self {
        Self {
            markdown: result.markdown,
            target_lang: result.target_lang,
            model: result.model,
            prompt_tokens: result.prompt_tokens,
            completion_tokens: result.completion_tokens,
            cached: false,
        }
    }
}

const MAX_SELECTION_CHARS: usize = 2_000;
const MIN_SUMMARY_CHARS: usize = 240;

/// Freeze the reading context for a Reader action. The paper was already
/// loaded from storage (existence + ownership verified); the active accepted
/// revision supplies provenance when present.
async fn freeze_reader_context(
    state: &AppState,
    request: &ReadingContextRequest,
    title: &str,
    abstract_text: Option<&str>,
) -> Result<ReadingContextEnvelope, String> {
    let provenance = crate::storage::ProvenanceRepo::new(&state.pool);
    let active_revision = provenance
        .active_revision(&request.paper_id)
        .await
        .map_err(|e| e.to_string())?;
    freeze_reading_context(
        &request.paper_id,
        title,
        abstract_text,
        None,
        active_revision.as_ref(),
        request,
    )
    .map_err(|e| format!("{}: {}", e.category(), e))
}

#[tauri::command]
pub async fn reader_translate_selection(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    selection: String,
    target_lang: Option<String>,
) -> Result<ReaderTranslateResult, String> {
    let text = selection.trim();
    if text.is_empty() {
        return Err("empty selection".into());
    }
    let repo = PaperRepo::new(&state.pool);
    let term_repo = PaperTermRepo::new(&state.pool);
    let paper = load_paper(&repo, &paper_id)
        .await
        .map_err(|e| e.to_string())?;
    let clipped = truncate(text, MAX_SELECTION_CHARS);
    let terms = build_term_insights(&repo, &term_repo, &paper, &clipped)
        .await
        .map_err(|e| e.to_string())?;
    let cfg = load_config(&state.paths).map_err(|e| e.to_string())?;
    let profile = active_reading_profile(&cfg).map_err(|e| e.to_string())?;
    let lang = target_lang.unwrap_or_else(|| "Chinese".to_string());

    let envelope = freeze_reader_context(
        &state,
        &ReadingContextRequest {
            paper_id: paper_id.clone(),
            selection: Some(SelectionContext {
                text: clipped.clone(),
                page: None,
            }),
            highlight_id: None,
            revision_id: None,
            max_body_chars: None,
        },
        &paper.title,
        paper.abstract_text.as_deref(),
    )
    .await?;

    run_reading_dispatch(
        &state,
        "reader_translate_selection",
        &paper_id,
        &profile.name,
        &profile.chat_model,
        &envelope,
        async {
            translate_selection(TranslateSelectionInput {
                client: &state.http,
                profile: &profile,
                paper: &paper,
                selection: &clipped,
                terms: &terms,
                target_lang: &lang,
            })
            .await
            .map_err(anyhow::Error::from)
        },
    )
    .await
}

#[tauri::command]
pub async fn paper_translated_markdown_get(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    target_lang: Option<String>,
) -> Result<Option<ReaderMarkdownTranslationResult>, String> {
    let cfg = load_config(&state.paths).map_err(|e| e.to_string())?;
    let lang = target_lang.unwrap_or(cfg.output_language);
    let repo = PaperRepo::new(&state.pool);
    load_paper(&repo, &paper_id)
        .await
        .map_err(|e| e.to_string())?;
    let Some(source) = state.paths.read_pdf_text(&paper_id) else {
        return Ok(None);
    };
    Ok(state
        .paths
        .read_translated_paper_markdown_cache(&paper_id, &lang, &source)
        .map(|cache| ReaderMarkdownTranslationResult {
            markdown: cache.markdown,
            target_lang: lang,
            model: cache.model,
            prompt_tokens: 0,
            completion_tokens: 0,
            cached: true,
        }))
}

#[tauri::command]
pub async fn paper_translate_markdown_estimate(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
) -> Result<Option<MarkdownTranslationEstimate>, String> {
    let repo = PaperRepo::new(&state.pool);
    let paper = load_paper(&repo, &paper_id)
        .await
        .map_err(|e| e.to_string())?;
    let Some(body) = crate::commands::summaries::load_or_extract_pdf_body(
        &state.paths,
        &paper_id,
        paper.pdf_path.as_deref(),
    )
    .await
    else {
        return Ok(None);
    };
    Ok(Some(estimate_markdown_translation(
        &body,
        MARKDOWN_CHUNK_CHARS,
    )))
}

#[tauri::command]
pub async fn paper_translate_markdown(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    target_lang: Option<String>,
) -> Result<ReaderMarkdownTranslationResult, String> {
    let cfg = load_config(&state.paths).map_err(|e| e.to_string())?;
    let profile = active_reading_profile(&cfg).map_err(|e| e.to_string())?.clone();
    let lang = target_lang.unwrap_or(cfg.output_language);
    let repo = PaperRepo::new(&state.pool);
    let paper = load_paper(&repo, &paper_id)
        .await
        .map_err(|e| e.to_string())?;
    let body = crate::commands::summaries::load_or_extract_pdf_body(
        &state.paths,
        &paper_id,
        paper.pdf_path.as_deref(),
    )
    .await
    .ok_or_else(|| "paper markdown is not available".to_string())?;

    let envelope = freeze_reader_context(
        &state,
        &ReadingContextRequest {
            paper_id: paper_id.clone(),
            selection: None,
            highlight_id: None,
            revision_id: None,
            max_body_chars: None,
        },
        &paper.title,
        paper.abstract_text.as_deref(),
    )
    .await?;

    let result = run_reading_dispatch(
        &state,
        "paper_translate_markdown",
        &paper_id,
        &profile.name,
        &profile.chat_model,
        &envelope,
        translate_markdown_text(&state.http, &profile, &paper.title, &body, &lang),
    )
    .await?;
    state
        .paths
        .write_translated_paper_markdown(
            &paper_id,
            &lang,
            &result.markdown,
            &body,
            &result.model,
            Utc::now().timestamp(),
        )
        .map_err(|e| e.to_string())?;
    Ok(ReaderMarkdownTranslationResult::from(result))
}

#[tauri::command]
pub async fn highlight_translate(
    state: State<'_, Arc<AppState>>,
    highlight_id: String,
    target_lang: Option<String>,
) -> Result<Highlight, String> {
    let highlight_repo = HighlightRepo::new(&state.pool);
    let highlight = load_highlight(&highlight_repo, &highlight_id)
        .await
        .map_err(|e| e.to_string())?;
    let text = highlight.text.trim();
    if text.is_empty() {
        return Err("highlight text is empty".into());
    }
    let paper_repo = PaperRepo::new(&state.pool);
    let term_repo = PaperTermRepo::new(&state.pool);
    let paper = load_paper(&paper_repo, &highlight.paper_id)
        .await
        .map_err(|e| e.to_string())?;
    let clipped = truncate(text, MAX_SELECTION_CHARS);
    let terms = build_term_insights(&paper_repo, &term_repo, &paper, &clipped)
        .await
        .map_err(|e| e.to_string())?;
    let cfg = load_config(&state.paths).map_err(|e| e.to_string())?;
    let profile = active_reading_profile(&cfg).map_err(|e| e.to_string())?;
    let lang = target_lang.unwrap_or_else(|| "Chinese".to_string());

    let envelope = freeze_reader_context(
        &state,
        &ReadingContextRequest {
            paper_id: highlight.paper_id.clone(),
            selection: Some(SelectionContext {
                text: clipped.clone(),
                page: Some(highlight.page),
            }),
            highlight_id: Some(highlight_id.clone()),
            revision_id: None,
            max_body_chars: None,
        },
        &paper.title,
        paper.abstract_text.as_deref(),
    )
    .await?;

    let result = run_reading_dispatch(
        &state,
        "highlight_translate",
        &highlight.paper_id,
        &profile.name,
        &profile.chat_model,
        &envelope,
        async {
            translate_selection(TranslateSelectionInput {
                client: &state.http,
                profile: &profile,
                paper: &paper,
                selection: &clipped,
                terms: &terms,
                target_lang: &lang,
            })
            .await
            .map_err(anyhow::Error::from)
        },
    )
    .await?;
    if result.translation.trim().is_empty() {
        return Err("empty translation response".into());
    }
    highlight_repo
        .update_translation(
            &highlight_id,
            &HighlightTranslationUpdate {
                text: &result.translation,
                target_lang: &lang,
                model: &result.model,
                translated_at: Utc::now().timestamp(),
            },
        )
        .await
        .map_err(|e| e.to_string())?;
    load_highlight(&highlight_repo, &highlight_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn highlight_summarize(
    state: State<'_, Arc<AppState>>,
    highlight_id: String,
) -> Result<Highlight, String> {
    let highlight_repo = HighlightRepo::new(&state.pool);
    let highlight = load_highlight(&highlight_repo, &highlight_id)
        .await
        .map_err(|e| e.to_string())?;
    let text = highlight.text.trim();
    if text.is_empty() {
        return Err("highlight text is empty".into());
    }
    if text.chars().count() < MIN_SUMMARY_CHARS {
        return Err("highlight too short to summarize".into());
    }
    let paper_repo = PaperRepo::new(&state.pool);
    let paper = load_paper(&paper_repo, &highlight.paper_id)
        .await
        .map_err(|e| e.to_string())?;
    let cfg = load_config(&state.paths).map_err(|e| e.to_string())?;
    let profile = active_reading_profile(&cfg).map_err(|e| e.to_string())?;
    let clipped = truncate(text, MAX_SELECTION_CHARS);

    let envelope = freeze_reader_context(
        &state,
        &ReadingContextRequest {
            paper_id: highlight.paper_id.clone(),
            selection: Some(SelectionContext {
                text: clipped.clone(),
                page: Some(highlight.page),
            }),
            highlight_id: Some(highlight_id.clone()),
            revision_id: None,
            max_body_chars: None,
        },
        &paper.title,
        paper.abstract_text.as_deref(),
    )
    .await?;

    let result = run_reading_dispatch(
        &state,
        "highlight_summarize",
        &highlight.paper_id,
        &profile.name,
        &profile.chat_model,
        &envelope,
        async {
            summarize_highlight(&state.http, &profile, &paper, &clipped)
                .await
                .map_err(anyhow::Error::from)
        },
    )
    .await?;
    if result.summary.trim().is_empty() {
        return Err("empty summary response".into());
    }
    highlight_repo
        .update_summary(
            &highlight_id,
            &HighlightSummaryUpdate {
                text: &result.summary,
                model: &result.model,
                summarized_at: Utc::now().timestamp(),
            },
        )
        .await
        .map_err(|e| e.to_string())?;
    load_highlight(&highlight_repo, &highlight_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn highlight_explain(
    state: State<'_, Arc<AppState>>,
    highlight_id: String,
) -> Result<Highlight, String> {
    explain::highlight_explain_impl(state, highlight_id).await
}

pub(super) async fn load_paper(repo: &PaperRepo<'_>, paper_id: &str) -> Result<Paper> {
    repo.get(paper_id)
        .await
        .map_err(|e| anyhow!(e))?
        .ok_or_else(|| anyhow!("paper not found"))
}

pub(super) async fn load_highlight(
    repo: &HighlightRepo<'_>,
    highlight_id: &str,
) -> Result<Highlight> {
    repo.get(highlight_id)
        .await?
        .ok_or_else(|| anyhow!("highlight not found"))
}

struct HighlightSummaryResult {
    summary: String,
    model: String,
}

async fn summarize_highlight(
    client: &reqwest::Client,
    profile: &LlmProfile,
    paper: &Paper,
    selection: &str,
) -> Result<HighlightSummaryResult> {
    let user_content = crate::ai::prompts::SUMMARIZE_HIGHLIGHT_USER
        .replace("{title}", &paper.title)
        .replace("{selection}", selection);
    let resp = chat_complete_for_task(
        client,
        profile,
        TaskKind::Tldr,
        &[
            ChatMessage {
                role: "system".into(),
                content: crate::ai::prompts::SUMMARIZE_HIGHLIGHT_SYSTEM.into(),
            },
            ChatMessage {
                role: "user".into(),
                content: user_content,
            },
        ],
    )
    .await?;
    Ok(HighlightSummaryResult {
        summary: parse_json_lenient(&resp.content)
            .get("summary")
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .trim()
            .to_string(),
        model: resp.model,
    })
}

fn parse_json_lenient(raw: &str) -> serde_json::Value {
    let trimmed = raw.trim();
    let body = strip_code_fence(trimmed);
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(body) {
        return value;
    }
    if let Some(end) = body.rfind('}') {
        if let Some(start) = body[..end].rfind('{') {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&body[start..=end]) {
                return value;
            }
        }
    }
    serde_json::json!({})
}

fn strip_code_fence(text: &str) -> &str {
    let stripped = text
        .strip_prefix("```json")
        .or_else(|| text.strip_prefix("```"))
        .unwrap_or(text);
    stripped
        .trim_start_matches('\n')
        .trim_end_matches("```")
        .trim()
}

fn truncate(text: &str, max_chars: usize) -> String {
    if text.chars().count() <= max_chars {
        return text.to_string();
    }
    let mut clipped = text.chars().take(max_chars).collect::<String>();
    clipped.push_str("...");
    clipped
}
