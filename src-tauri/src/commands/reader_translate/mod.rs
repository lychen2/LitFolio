mod terms;

use std::sync::Arc;

use anyhow::{anyhow, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::ai::{active_profile_for_task, chat_complete, load_config, ChatMessage, LlmProfile, TaskKind};
use crate::storage::{
    Highlight, HighlightRepo, HighlightSummaryUpdate, HighlightTranslationUpdate, Paper, PaperRepo,
    PaperTermRepo,
};
use crate::AppState;

use self::terms::{build_term_insights, TermInsight};

const MAX_SELECTION_CHARS: usize = 2_000;
const MIN_SUMMARY_CHARS: usize = 240;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReaderTranslateResult {
    pub translation: String,
    pub terms: Vec<TermInsight>,
    pub model: String,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
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
    let paper = load_paper(&repo, &paper_id).await.map_err(|e| e.to_string())?;
    let clipped = truncate(text, MAX_SELECTION_CHARS);
    let terms = build_term_insights(&repo, &term_repo, &paper, &clipped)
        .await
        .map_err(|e| e.to_string())?;
    let cfg = load_config(&state.paths).map_err(|e| e.to_string())?;
    let profile = active_profile_for_task(&cfg, TaskKind::Translate).map_err(|e| e.to_string())?;
    let lang = target_lang.unwrap_or_else(|| "Chinese".to_string());
    translate_selection(&state.http, &profile, &paper, &clipped, &terms, &lang)
        .await
        .map_err(|e| e.to_string())
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
    let profile = active_profile_for_task(&cfg, TaskKind::Translate).map_err(|e| e.to_string())?;
    let lang = target_lang.unwrap_or_else(|| "Chinese".to_string());
    let result = translate_selection(&state.http, &profile, &paper, &clipped, &terms, &lang)
        .await
        .map_err(|e| e.to_string())?;
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
    let profile = active_profile_for_task(&cfg, TaskKind::Tldr).map_err(|e| e.to_string())?;
    let clipped = truncate(text, MAX_SELECTION_CHARS);
    let result = summarize_highlight(&state.http, &profile, &paper, &clipped)
        .await
        .map_err(|e| e.to_string())?;
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

async fn load_paper(repo: &PaperRepo<'_>, paper_id: &str) -> Result<Paper> {
    repo.get(paper_id)
        .await
        .map_err(|e| anyhow!(e))?
        .ok_or_else(|| anyhow!("paper not found"))
}

async fn load_highlight(repo: &HighlightRepo<'_>, highlight_id: &str) -> Result<Highlight> {
    repo.get(highlight_id)
        .await?
        .ok_or_else(|| anyhow!("highlight not found"))
}

async fn translate_selection(
    client: &reqwest::Client,
    profile: &LlmProfile,
    paper: &Paper,
    selection: &str,
    terms: &[TermInsight],
    target_lang: &str,
) -> Result<ReaderTranslateResult> {
    let glossary = format_glossary(terms);
    let user_content = format!(
        "Target language: {target_lang}\nPaper title: {}\n\nSelection:\n{}\n\nGlossary:\n{}\n\nReturn ONLY JSON: {{\"translation\": \"...\"}}.\nRules:\n- Translate faithfully.\n- Keep every glossary term in English and wrap it as Term〔中文释义〕 on first mention.\n- Keep acronyms and terminology consistent.\n- Do not summarize or omit technical detail.",
        paper.title, selection, glossary
    );
    let resp = chat_complete(
        client,
        profile,
        &[
            ChatMessage {
                role: "system".into(),
                content: "You are a precise scientific translator for in-context reading assistance.".into(),
            },
            ChatMessage {
                role: "user".into(),
                content: user_content,
            },
        ],
    )
    .await?;
    Ok(ReaderTranslateResult {
        translation: parse_translation(&resp.content),
        terms: terms.to_vec(),
        model: resp.model,
        prompt_tokens: resp.prompt_tokens,
        completion_tokens: resp.completion_tokens,
    })
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
    let user_content = format!(
        "Paper title: {}\n\nHighlighted passage:\n{}\n\nReturn ONLY JSON: {{\"summary\": \"...\"}}.\nRules:\n- Write exactly one sentence in Chinese.\n- Keep the sentence under 36 Chinese characters when possible.\n- Capture the main claim, method, or result of this passage.\n- Do not add facts not present in the passage.",
        paper.title, selection
    );
    let resp = chat_complete(
        client,
        profile,
        &[
            ChatMessage {
                role: "system".into(),
                content: "You compress technical passages into one precise sentence for a research reader.".into(),
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

fn format_glossary(terms: &[TermInsight]) -> String {
    if terms.is_empty() {
        return "No glossary terms matched in this passage.".into();
    }
    terms
        .iter()
        .map(|term| format!("- {} | local: {}", term.term, term.local_definition))
        .collect::<Vec<_>>()
        .join("\n")
}

fn parse_translation(raw: &str) -> String {
    let parsed = parse_json_lenient(raw);
    parsed
        .get("translation")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .trim()
        .to_string()
}

fn parse_json_lenient(raw: &str) -> serde_json::Value {
    let trimmed = raw.trim();
    let body = strip_code_fence(trimmed);
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(body) {
        return value;
    }
    if let (Some(start), Some(end)) = (body.find('{'), body.rfind('}')) {
        if start < end {
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
