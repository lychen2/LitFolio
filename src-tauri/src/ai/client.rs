//! OpenAI-compatible chat completion (non-streaming v1).
//!
//! Works with: OpenAI, Azure OpenAI (with proper base_url), Anthropic via gateway,
//! DeepSeek, Together, Moonshot/Kimi, SiliconFlow, Ollama (`http://localhost:11434/v1`).

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};

use super::profile::LlmProfile;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String, // "system" | "user" | "assistant"
    pub content: String,
}

#[derive(Debug, Clone, Serialize)]
struct ChatRequest<'a> {
    model: &'a str,
    messages: &'a [ChatMessage],
    temperature: f32,
    max_tokens: u32,
    stream: bool,
}

#[derive(Debug, Deserialize)]
struct ChatRawResponse {
    #[serde(default)]
    choices: Vec<Choice>,
    #[serde(default)]
    usage: Option<Usage>,
}

#[derive(Debug, Deserialize)]
struct Choice {
    #[serde(default)]
    message: Option<ChatMessage>,
    #[serde(default)]
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Usage {
    #[serde(default)]
    prompt_tokens: u32,
    #[serde(default)]
    completion_tokens: u32,
    #[serde(default)]
    total_tokens: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct ChatResponse {
    pub content: String,
    pub finish_reason: Option<String>,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub model: String,
}

pub async fn chat_complete(
    client: &reqwest::Client,
    profile: &LlmProfile,
    messages: &[ChatMessage],
) -> Result<ChatResponse> {
    let url = endpoint(&profile.base_url, "/chat/completions");
    let body = ChatRequest {
        model: &profile.chat_model,
        messages,
        temperature: profile.temperature,
        max_tokens: profile.max_tokens,
        stream: false,
    };
    let mut req = client.post(&url).json(&body);
    if !profile.api_key.is_empty() {
        req = req.bearer_auth(&profile.api_key);
    }
    let resp = req.send().await.with_context(|| format!("POST {url}"))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(anyhow!("LLM endpoint returned {status}: {}", truncate(&text, 800)));
    }
    let parsed: ChatRawResponse = serde_json::from_str(&text)
        .with_context(|| format!("decode chat response: {}", truncate(&text, 300)))?;
    let choice = parsed.choices.into_iter().next()
        .ok_or_else(|| anyhow!("LLM returned no choices"))?;
    let msg = choice.message.ok_or_else(|| anyhow!("LLM choice missing message"))?;
    let usage = parsed.usage.unwrap_or(Usage::default());
    Ok(ChatResponse {
        content: msg.content,
        finish_reason: choice.finish_reason,
        prompt_tokens: usage.prompt_tokens,
        completion_tokens: usage.completion_tokens,
        model: profile.chat_model.clone(),
    })
}

impl Default for Usage {
    fn default() -> Self {
        Self { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    }
}

fn endpoint(base_url: &str, path: &str) -> String {
    let trimmed = base_url.trim_end_matches('/');
    format!("{trimmed}{path}")
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max { return s.to_string(); }
    let mut out: String = s.chars().take(max).collect();
    out.push_str("…");
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn endpoint_joins_correctly() {
        assert_eq!(endpoint("https://api.openai.com/v1", "/chat/completions"),
                   "https://api.openai.com/v1/chat/completions");
        assert_eq!(endpoint("http://localhost:11434/v1/", "/chat/completions"),
                   "http://localhost:11434/v1/chat/completions");
    }

    #[test]
    fn truncate_works() {
        assert_eq!(truncate("abc", 10), "abc");
        assert_eq!(truncate("abcdefghij", 5), "abcde…");
    }
}
