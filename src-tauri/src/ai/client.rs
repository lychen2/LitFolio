//! OpenAI-compatible chat completion.
//!
//! Handles both shapes the wire actually returns:
//!  1. Plain JSON (standard OpenAI / DeepSeek / Moonshot / Ollama when `stream: false`)
//!  2. SSE (`data: {...}\n\ndata: [DONE]`) — some Chinese gateway proxies (new-api etc.)
//!     ignore the `stream:false` flag and stream anyway. We must accumulate the deltas
//!     ourselves or the response looks empty (0 output tokens).

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};

use super::profile::LlmProfile;
use request::{is_reasoning_model, request_shape, ChatRequest, ThinkingConfig};
use response::parse_response;
use utils::{endpoint, header_value, llm_request_timeout, request_chars, truncate};

const LLM_REQUEST_TIMEOUT_SECS: u64 = 120;

mod request;
mod response;
#[cfg(test)]
mod tests;
mod utils;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String, // "system" | "user" | "assistant"
    pub content: String,
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
    let request_shape = request_shape(&profile.chat_model, profile.max_tokens, profile.temperature);
    let body = ChatRequest {
        model: &profile.chat_model,
        messages,
        temperature: request_shape.temperature,
        // Always stream. Standard providers (OpenAI / DeepSeek / Moonshot / SiliconFlow / Ollama)
        // all support stream:true and return SSE we know how to parse. Several Chinese gateway
        // proxies (new-api/one-api) silently return an empty metadata-only frame when stream:false
        // — gpt-5.4 via the songsongcard proxy was reproducible — so non-streaming is unreliable
        // in practice. The parser handles a single-JSON response too if a provider ignores the flag
        // and replies non-streaming anyway.
        stream: true,
        max_tokens: request_shape.max_tokens,
        max_completion_tokens: request_shape.max_completion_tokens,
        // Disable chain-of-thought for chat/instruction models that tend to
        // leak reasoning into `content`. Reasoning-native models (R1, o1/o3,
        // deepseek-reasoner) put thinking in `reasoning_content` and answer
        // in `content` — they get `thinking: None` so their reasoning is
        // preserved.
        thinking: if is_reasoning_model(&profile.chat_model) {
            None
        } else {
            Some(ThinkingConfig {
                r#type: "disabled".into(),
            })
        },
    };
    let mut req = client.post(&url).json(&body);
    if !profile.api_key.is_empty() {
        req = req.bearer_auth(&profile.api_key);
    }
    let resp = tokio::time::timeout(llm_request_timeout(), req.send())
        .await
        .map_err(|_| {
            anyhow!(
                "LLM request timed out after {}s (model `{}`, url={url})",
                LLM_REQUEST_TIMEOUT_SECS,
                profile.chat_model
            )
        })?
        .with_context(|| format!("POST {url}"))?;
    let status = resp.status();
    let headers = resp.headers().clone();
    let text = tokio::time::timeout(llm_request_timeout(), resp.text())
        .await
        .map_err(|_| {
            anyhow!(
                "LLM response body timed out after {}s (model `{}`, url={url})",
                LLM_REQUEST_TIMEOUT_SECS,
                profile.chat_model
            )
        })?
        .with_context(|| {
            format!(
                "read LLM response body for model `{}` from {url}",
                profile.chat_model
            )
        })?;
    if !status.is_success() {
        return Err(anyhow!(
            "LLM endpoint returned {status} (model `{}`, url={url}, stream=true, request_chars={}, token_param={}, temperature={}): {}",
            profile.chat_model,
            request_chars(messages),
            request_shape.token_param_name(),
            request_shape.temperature_label(),
            truncate(&text, 800)
        ));
    }
    if text.trim().is_empty() {
        return Err(anyhow!(
            "LLM endpoint returned an empty response body for model `{}`; status={status}, url={}, stream=true, request_chars={}, content-type={}, content-length={}. The provider/proxy closed the request without JSON or SSE data",
            profile.chat_model,
            url,
            request_chars(messages),
            header_value(&headers, "content-type"),
            header_value(&headers, "content-length"),
        ));
    }
    let parsed = parse_response(&text)
        .with_context(|| format!("decode chat response: {}", truncate(&text, 500)))?;
    Ok(ChatResponse {
        content: parsed.content,
        finish_reason: parsed.finish_reason,
        prompt_tokens: parsed.usage.prompt_tokens,
        completion_tokens: parsed.usage.completion_tokens,
        model: profile.chat_model.clone(),
    })
}
