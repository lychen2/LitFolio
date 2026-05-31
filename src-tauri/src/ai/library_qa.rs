//! Library RAG answer generation over retrieved paper snippets.
//!
//! The pipeline that calls into here is responsible for:
//!   1. (in `commands/ask.rs`) rewriting the user's natural-language question into a
//!      tight set of English search terms via [`super::query_expand`] and fanning out
//!      multi-term FTS5 retrieval — raw Chinese ANDed-token retrieval is essentially
//!      0-recall, so the rewrite is load-bearing.
//!   2. Loading user highlights for the retrieved papers and passing them here.
//!
//! This module then builds rich per-paper snippets (TL;DR + abstract + problem/
//! method/comparison/limitations + key findings + top user highlights), packs them
//! into a single context block bounded by [`MAX_CONTEXT_CHARS`], and calls the LLM
//! with a citation-strict system prompt.

use std::collections::HashMap;

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};

use super::client::{chat_complete, ChatMessage};
use super::profile::LlmProfile;
use crate::storage::{Highlight, Paper};

mod context;
#[cfg(test)]
mod tests;

use context::{build_context, build_sources, truncate};

const MAX_HISTORY_TURNS: usize = 6;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AskSource {
    pub paper_id: String,
    pub title: String,
    pub year: Option<i32>,
    pub authors: Vec<String>,
    pub snippet: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AskLibraryResult {
    pub answer: String,
    pub sources: Vec<AskSource>,
    pub model: String,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    /// Search terms actually used to retrieve sources (LLM-rewritten when available,
    /// else the raw question). UI can render these as chips so the user can tell
    /// whether the rewrite captured their intent.
    #[serde(default)]
    pub terms: Vec<String>,
    /// Number of distinct papers fed to the LLM as sources.
    #[serde(default)]
    pub retrieved_count: usize,
}

const SYSTEM_PROMPT: &str = "You answer questions about a user's local academic paper library.\n\n\
Rules:\n\
- Reply in 中文 regardless of question language.\n\
- Use ONLY the provided sources. Do not invent papers, authors, years, or DOIs.\n\
- Cite sources inline as [1], [2], etc., placed right after the claim each supports.\n\
- Structure: lead with one direct conclusion sentence, then a short paragraph or 3-5 bullet points with the supporting citations.\n\
- If the sources are insufficient, say so explicitly and describe what kind of paper would be needed — never guess.\n\
- Do not pad with generic background; stay tight to the question.\n\
- Prefer citing 2-4 sources when relevant; do not just dump every source.";

const NO_SOURCES_ANSWER: &str = "未在你的文献库中检索到与此问题相关的论文。可以尝试:\n\
1. 用更具体的关键词重新提问;\n\
2. 把相关论文 📥 入库后再问;\n\
3. 在 📚 主题发现 中先找几篇代表作。";

pub fn empty_result(terms: Vec<String>) -> AskLibraryResult {
    AskLibraryResult {
        answer: NO_SOURCES_ANSWER.into(),
        sources: Vec::new(),
        model: String::new(),
        prompt_tokens: 0,
        completion_tokens: 0,
        terms,
        retrieved_count: 0,
    }
}

pub async fn answer_library_question(
    client: &reqwest::Client,
    profile: &LlmProfile,
    question: &str,
    papers: &[Paper],
    highlights: &HashMap<String, Vec<Highlight>>,
    terms: &[String],
    conversation_history: &[ChatMessage],
) -> Result<AskLibraryResult> {
    let trimmed = question.trim();
    if trimmed.is_empty() {
        return Err(anyhow!("empty question"));
    }
    let sources = build_sources(papers, highlights, terms);
    if sources.is_empty() {
        return Ok(empty_result(terms.to_vec()));
    }
    let context = build_context(&sources);
    let user =
        format!("Question:\n{trimmed}\n\nSources (numbered, cite by these numbers):\n{context}");

    // Build messages with windowed conversation history
    let mut messages = vec![ChatMessage {
        role: "system".into(),
        content: SYSTEM_PROMPT.into(),
    }];

    // Window conversation history: keep last MAX_HISTORY_TURNS turns,
    // summarize older turns into a condensed context message.
    if conversation_history.len() > MAX_HISTORY_TURNS {
        let split = conversation_history.len() - MAX_HISTORY_TURNS;
        let (older, recent) = conversation_history.split_at(split);
        let summary = summarize_history(older);
        messages.push(ChatMessage {
            role: "system".into(),
            content: format!("Previous conversation summary:\n{summary}"),
        });
        for msg in recent {
            messages.push(msg.clone());
        }
    } else {
        for msg in conversation_history {
            messages.push(msg.clone());
        }
    }

    // Add current question with sources
    messages.push(ChatMessage {
        role: "user".into(),
        content: user,
    });

    let resp = chat_complete(client, profile, &messages).await?;
    let retrieved_count = sources.len();
    Ok(AskLibraryResult {
        answer: resp.content,
        sources,
        model: resp.model,
        prompt_tokens: resp.prompt_tokens,
        completion_tokens: resp.completion_tokens,
        terms: terms.to_vec(),
        retrieved_count,
    })
}

fn summarize_history(messages: &[ChatMessage]) -> String {
    messages
        .iter()
        .map(|m| {
            let prefix = if m.role == "user" { "Q" } else { "A" };
            let content = truncate(&m.content, 200);
            format!("{prefix}: {content}")
        })
        .collect::<Vec<_>>()
        .join("\n")
}
