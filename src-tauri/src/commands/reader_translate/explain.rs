use std::sync::Arc;

use anyhow::Result;
use chrono::Utc;
use tauri::State;

use crate::ai::{
    active_profile_for_task, chat_complete, load_config, ChatMessage, LlmProfile, TaskKind,
};
use crate::storage::{Highlight, HighlightExplanationUpdate, HighlightRepo, Paper, PaperRepo};
use crate::AppState;

use super::{load_highlight, load_paper};

const EXPLAIN_MAX_BODY_CHARS: usize = 4_000;

pub(super) async fn highlight_explain_impl(
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
    let paper_repo = PaperRepo::new(&state.pool);
    let paper = load_paper(&paper_repo, &highlight.paper_id)
        .await
        .map_err(|e| e.to_string())?;
    let cfg = load_config(&state.paths).map_err(|e| e.to_string())?;
    let profile = active_profile_for_task(&cfg, TaskKind::Tldr).map_err(|e| e.to_string())?;
    let full_body = state.paths.read_pdf_text(&highlight.paper_id);
    let body = truncate_body(&full_body, EXPLAIN_MAX_BODY_CHARS);
    let result = explain_highlight(&state.http, &profile, &paper, text, &body)
        .await
        .map_err(|e| e.to_string())?;
    if result.explanation.trim().is_empty() {
        return Err("empty explanation response".into());
    }
    highlight_repo
        .update_explanation(
            &highlight_id,
            &HighlightExplanationUpdate {
                text: &result.explanation,
                model: &result.model,
                explained_at: Utc::now().timestamp(),
            },
        )
        .await
        .map_err(|e| e.to_string())?;
    load_highlight(&highlight_repo, &highlight_id)
        .await
        .map_err(|e| e.to_string())
}

struct HighlightExplanationResult {
    explanation: String,
    model: String,
}

async fn explain_highlight(
    client: &reqwest::Client,
    profile: &LlmProfile,
    paper: &Paper,
    selection: &str,
    body: &str,
) -> Result<HighlightExplanationResult> {
    let authors = paper.authors.join(", ");
    let year = paper
        .year
        .map(|y| y.to_string())
        .unwrap_or_else(|| "(unknown)".into());
    let user_content = crate::ai::prompts::EXPLAIN_HIGHLIGHT_USER
        .replace("{title}", &paper.title)
        .replace("{authors}", &authors)
        .replace("{year}", &year)
        .replace("{full_text}", body)
        .replace("{selection}", selection);
    let resp = chat_complete(
        client,
        profile,
        &[
            ChatMessage {
                role: "system".into(),
                content: crate::ai::prompts::EXPLAIN_HIGHLIGHT_SYSTEM.into(),
            },
            ChatMessage {
                role: "user".into(),
                content: user_content,
            },
        ],
    )
    .await?;
    Ok(HighlightExplanationResult {
        explanation: resp.content,
        model: resp.model,
    })
}

fn truncate_body(body: &Option<String>, max_chars: usize) -> String {
    let text = match body {
        Some(s) => s.as_str(),
        None => return "(全文文本暂未缓存，请先在阅读器中打开此论文)".into(),
    };
    if text.chars().count() <= max_chars {
        return text.to_string();
    }
    let head_ratio = 0.4;
    let tail_ratio = 0.2;
    let head_chars = (max_chars as f64 * head_ratio) as usize;
    let tail_chars = (max_chars as f64 * tail_ratio) as usize;
    let head: String = text.chars().take(head_chars).collect();
    let tail: String = text
        .chars()
        .rev()
        .take(tail_chars)
        .collect::<String>()
        .chars()
        .rev()
        .collect();
    format!(
        "{head}\n\n... (全文共 {} 字符，中间部分已省略) ...\n\n{tail}",
        text.chars().count(),
    )
}
