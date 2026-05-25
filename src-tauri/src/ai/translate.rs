//! Title + abstract translation workflow.

use anyhow::Result;
use serde::{Deserialize, Serialize};

use super::client::{chat_complete, ChatMessage};
use super::profile::LlmProfile;
use super::summarize::parse_json_lenient;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranslationResult {
    pub title: String,
    pub abstract_text: String,
    pub target_lang: String,
    pub model: String,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
}

const SYSTEM_PROMPT: &str = "You are a precise scientific translator. \
Translate the supplied paper title and abstract to the requested language. \
Preserve technical terms (model names, algorithm names, mathematical symbols, \
units, dataset names) verbatim. Do not paraphrase or summarize. \
Return ONLY JSON in this exact shape: {\"title\": \"...\", \"abstract\": \"...\"}.";

pub async fn translate_paper_text(
    client: &reqwest::Client,
    profile: &LlmProfile,
    title: &str,
    abstract_text: Option<&str>,
    target_lang: &str,
) -> Result<TranslationResult> {
    let user_content = format!(
        "Target language: {target_lang}\n\nTitle:\n{title}\n\nAbstract:\n{}",
        abstract_text.unwrap_or("(no abstract supplied)"),
    );
    let resp = chat_complete(
        client,
        profile,
        &[
            ChatMessage {
                role: "system".into(),
                content: SYSTEM_PROMPT.into(),
            },
            ChatMessage {
                role: "user".into(),
                content: user_content,
            },
        ],
    )
    .await?;
    let v = parse_json_lenient(&resp.content);
    let title_tx = v
        .get("title")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let abstract_tx = v
        .get("abstract")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    Ok(TranslationResult {
        title: title_tx,
        abstract_text: abstract_tx,
        target_lang: target_lang.to_string(),
        model: resp.model,
        prompt_tokens: resp.prompt_tokens,
        completion_tokens: resp.completion_tokens,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_translation_json() {
        let v = parse_json_lenient(r#"{"title":"标题","abstract":"摘要"}"#);
        assert_eq!(v["title"], "标题");
        assert_eq!(v["abstract"], "摘要");
    }
}
