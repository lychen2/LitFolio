use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};

use crate::ai::{chat_complete, ChatMessage, LlmProfile};
use crate::storage::Paper;

use super::terms::TermInsight;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReaderTranslateResult {
    pub translation: String,
    pub terms: Vec<TermInsight>,
    pub model: String,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
}

pub(super) async fn translate_selection(
    client: &reqwest::Client,
    profile: &LlmProfile,
    paper: &Paper,
    selection: &str,
    terms: &[TermInsight],
    target_lang: &str,
) -> Result<ReaderTranslateResult> {
    let glossary = format_glossary(terms);
    let user_content = crate::ai::prompts::READER_TRANSLATE_USER
        .replace("{lang}", target_lang)
        .replace("{title}", &paper.title)
        .replace("{selection}", selection)
        .replace("{glossary}", &glossary);
    let resp = chat_complete(
        client,
        profile,
        &[
            ChatMessage {
                role: "system".into(),
                content: crate::ai::prompts::READER_TRANSLATE_SYSTEM.into(),
            },
            ChatMessage {
                role: "user".into(),
                content: user_content,
            },
        ],
    )
    .await?;
    let translation = parse_translation(&resp.content);
    if translation.trim().is_empty() {
        let snippet: String = resp.content.trim().chars().take(120).collect();
        return Err(anyhow!(
            "empty translation — model returned {} chars: {snippet}",
            resp.content.trim().chars().count()
        ));
    }
    Ok(ReaderTranslateResult {
        translation,
        terms: terms.to_vec(),
        model: resp.model,
        prompt_tokens: resp.prompt_tokens,
        completion_tokens: resp.completion_tokens,
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
    if let Some(value) = parsed.get("translation").and_then(|v| v.as_str()) {
        let t = value.trim();
        if let Some(filtered) = filter_placeholder(t) {
            return filtered.to_string();
        }
    }
    let body = strip_code_fence(raw.trim());
    if let Some(inner) = extract_json_string_value(body, "translation") {
        if let Some(filtered) = filter_placeholder(&inner) {
            return filtered.to_string();
        }
    }
    let fallback = body
        .lines()
        .filter(|l| !l.trim().is_empty())
        .max_by_key(|l| l.trim().chars().count())
        .unwrap_or(body)
        .trim();
    if let Some(filtered) = filter_placeholder(fallback) {
        return filtered.to_string();
    }
    String::new()
}

fn extract_json_string_value(raw: &str, key: &str) -> Option<String> {
    let prefix = format!("\"{key}\":");
    let after_key = raw.find(&prefix)?;
    let after_key = &raw[after_key + prefix.len()..];
    let after_key = after_key.trim_start();
    let after_key = after_key.strip_prefix('"')?;
    let closing = after_key.rfind("\"}")?;
    Some(after_key[..closing].to_string())
}

fn filter_placeholder(s: &str) -> Option<&str> {
    let lower = s.to_lowercase();
    for skip in &["...", "…"] {
        if lower == *skip {
            return None;
        }
    }
    if lower.contains("put the") || lower.contains("replace") {
        return None;
    }
    if s.chars().count() <= 3 && !s.chars().any(|c| c.is_ascii_alphabetic()) {
        return None;
    }
    Some(s)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_translation_handles_newlines_in_json_value() {
        let raw = "{\"translation\": \"对于由两个束缚本征态组成的波包，其振荡周期 \nT\no\ns\nc\n=\n2\nπ\n/\nΔ\nW\n 也决定了粒子对外部扰动的响应时间。\"}";
        let result = parse_translation(raw);
        assert!(result.contains("波包"));
        assert!(result.contains("振荡周期"));
        assert!(result.contains("束缚本征态"));
        assert!(!result.starts_with("{\"translation\""));
    }

    #[test]
    fn parse_translation_json_still_works() {
        let raw = "{\"translation\": \"正常翻译结果\"}";
        let result = parse_translation(raw);
        assert_eq!(result, "正常翻译结果");
    }

    #[test]
    fn parse_translation_with_code_fence() {
        let raw = "```json\n{\"translation\": \"带 fence 的翻译\"}\n```";
        let result = parse_translation(raw);
        assert_eq!(result, "带 fence 的翻译");
    }
}
