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

const MAX_CONTEXT_CHARS: usize = 14_000;
const MAX_SNIPPET_CHARS: usize = 1_800;
const MAX_HIGHLIGHTS_PER_PAPER: usize = 3;
const MAX_HIGHLIGHT_TEXT_CHARS: usize = 240;

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
    let sources = build_sources(papers, highlights);
    if sources.is_empty() {
        return Ok(empty_result(terms.to_vec()));
    }
    let context = build_context(&sources);
    let user =
        format!("Question:\n{trimmed}\n\nSources (numbered, cite by these numbers):\n{context}");

    // Build messages with conversation history
    let mut messages = vec![
        ChatMessage {
            role: "system".into(),
            content: SYSTEM_PROMPT.into(),
        },
    ];

    // Add conversation history (excluding the current question)
    for msg in conversation_history {
        messages.push(msg.clone());
    }

    // Add current question with sources
    messages.push(ChatMessage {
        role: "user".into(),
        content: user,
    });

    let resp = chat_complete(
        client,
        profile,
        &messages,
    )
    .await?;
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

fn build_sources(papers: &[Paper], highlights: &HashMap<String, Vec<Highlight>>) -> Vec<AskSource> {
    papers
        .iter()
        .filter_map(|p| {
            let hl = highlights.get(&p.id).map(Vec::as_slice).unwrap_or(&[]);
            let snippet = paper_snippet(p, hl);
            if snippet.is_empty() {
                return None;
            }
            Some(AskSource {
                paper_id: p.id.clone(),
                title: p.title.clone(),
                year: p.year,
                authors: p.authors.clone(),
                snippet,
            })
        })
        .collect()
}

fn paper_snippet(p: &Paper, highlights: &[Highlight]) -> String {
    let mut parts = Vec::new();
    push_part(&mut parts, "TL;DR", p.tldr.as_deref());
    push_part(&mut parts, "Abstract", p.abstract_text.as_deref());
    push_part(&mut parts, "Problem", p.research_question.as_deref());
    push_part(&mut parts, "Method", p.method.as_deref());
    push_part(&mut parts, "Comparison", p.comparison.as_deref());
    push_part(&mut parts, "Limitations", p.limitations.as_deref());
    if !p.key_findings.is_empty() {
        parts.push(format!("Key findings: {}", p.key_findings.join("; ")));
    }
    let quotes: Vec<String> = highlights
        .iter()
        .take(MAX_HIGHLIGHTS_PER_PAPER)
        .filter_map(|h| {
            let t = h.text.trim();
            if t.is_empty() {
                None
            } else {
                Some(format!("\"{}\"", truncate(t, MAX_HIGHLIGHT_TEXT_CHARS)))
            }
        })
        .collect();
    if !quotes.is_empty() {
        parts.push(format!("User highlights: {}", quotes.join(" / ")));
    }
    truncate(&parts.join("\n"), MAX_SNIPPET_CHARS)
}

fn push_part(parts: &mut Vec<String>, label: &str, value: Option<&str>) {
    if let Some(text) = value.map(str::trim).filter(|s| !s.is_empty()) {
        parts.push(format!("{label}: {text}"));
    }
}

fn build_context(sources: &[AskSource]) -> String {
    let mut out = String::new();
    for (idx, source) in sources.iter().enumerate() {
        let authors = source
            .authors
            .iter()
            .take(4)
            .cloned()
            .collect::<Vec<_>>()
            .join(", ");
        let year = source
            .year
            .map(|y| y.to_string())
            .unwrap_or_else(|| "n.d.".into());
        let block = format!(
            "[{}] {} ({year})\nAuthors: {authors}\n{}\n\n",
            idx + 1,
            source.title,
            source.snippet,
        );
        if out.chars().count() + block.chars().count() > MAX_CONTEXT_CHARS {
            break;
        }
        out.push_str(&block);
    }
    out
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_string();
    }
    let mut out: String = s.chars().take(max).collect();
    out.push_str("...");
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::ReadStatus;
    use serde_json::json;

    fn paper() -> Paper {
        Paper {
            id: "p1".into(),
            title: "A".into(),
            authors: vec!["Ada".into()],
            year: Some(2024),
            venue: None,
            doi: None,
            arxiv_id: None,
            abstract_text: Some("abstract".into()),
            pdf_path: Some("/tmp/a.pdf".into()),
            note_path: None,
            added_at: 0,
            updated_at: 0,
            read_status: ReadStatus::Unread,
            tldr: Some("short".into()),
            research_question: None,
            method: None,
            dataset: None,
            key_findings: vec!["finding".into()],
            limitations: None,
            comparison: Some("differs from baseline by X".into()),
            title_translated: None,
            abstract_translated: None,
            translate_target_lang: None,
            translated_at: None,
            bibtex: None,
            last_exported_at: None,
        }
    }

    fn highlight(text: &str) -> Highlight {
        Highlight {
            id: "h".into(),
            paper_id: "p1".into(),
            page: 1,
            rect: json!({}),
            color: "yellow".into(),
            label: None,
            text: text.into(),
            note: None,
            summary_text: None,
            summary_model: None,
            summarized_at: None,
            translation_text: None,
            translation_target_lang: None,
            translation_model: None,
            translated_at: None,
            created_at: 0,
        }
    }

    #[test]
    fn builds_source_snippet_with_no_highlights() {
        let highlights = HashMap::new();
        let sources = build_sources(&[paper()], &highlights);
        assert_eq!(sources.len(), 1);
        assert!(sources[0].snippet.contains("TL;DR"));
        assert!(sources[0].snippet.contains("Key findings"));
        assert!(sources[0].snippet.contains("Comparison"));
    }

    #[test]
    fn includes_highlights_in_snippet() {
        let mut highlights = HashMap::new();
        highlights.insert("p1".into(), vec![highlight("important quoted passage")]);
        let sources = build_sources(&[paper()], &highlights);
        assert!(sources[0].snippet.contains("User highlights"));
        assert!(sources[0].snippet.contains("important quoted passage"));
    }

    #[test]
    fn empty_result_carries_terms() {
        let r = empty_result(vec!["foo".into(), "bar".into()]);
        assert!(r.sources.is_empty());
        assert_eq!(r.retrieved_count, 0);
        assert_eq!(r.terms, vec!["foo".to_string(), "bar".into()]);
        assert!(r.answer.contains("未在"));
    }
}
