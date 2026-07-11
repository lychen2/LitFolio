//! OpenAI-compatible chat completion.
//!
//! Handles both shapes the wire actually returns:
//!  1. Plain JSON (standard OpenAI / DeepSeek / Moonshot / Ollama when `stream: false`)
//!  2. SSE (`data: {...}\n\ndata: [DONE]`) — some Chinese gateway proxies (new-api etc.)
//!     ignore the `stream:false` flag and stream anyway. We must accumulate the deltas
//!     ourselves or the response looks empty (0 output tokens).

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use std::sync::LazyLock;
use std::time::{Duration, Instant};

use tokio::sync::{Mutex, Semaphore};

use super::profile::{LlmProfile, TaskKind};
use request::{is_reasoning_model, request_shape, ChatRequest, ThinkingConfig};
use response::parse_response;
use utils::{endpoint, header_value, llm_request_timeout, request_chars, truncate};

const LLM_REQUEST_TIMEOUT_SECS: u64 = 120;
#[cfg(not(test))]
const LLM_MIN_REQUEST_INTERVAL: Duration = Duration::from_secs(5);
#[cfg(test)]
const LLM_MIN_REQUEST_INTERVAL: Duration = Duration::from_millis(10);
#[cfg(not(test))]
const LLM_OVERLOAD_COOLDOWN: Duration = Duration::from_secs(45);
#[cfg(test)]
const LLM_OVERLOAD_COOLDOWN: Duration = Duration::from_millis(30);
static LLM_CHAT_GATE: LazyLock<Semaphore> = LazyLock::new(|| Semaphore::new(1));
static LLM_CHAT_THROTTLE: LazyLock<Mutex<LlmThrottle>> =
    LazyLock::new(|| Mutex::new(LlmThrottle::default()));

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
    chat_complete_with_task_kind(client, profile, "unassigned", messages).await
}

pub async fn chat_complete_for_task(
    client: &reqwest::Client,
    profile: &LlmProfile,
    task: TaskKind,
    messages: &[ChatMessage],
) -> Result<ChatResponse> {
    chat_complete_with_task_kind(client, profile, task.as_str(), messages).await
}

pub async fn chat_complete_with_task_kind(
    client: &reqwest::Client,
    profile: &LlmProfile,
    task_kind: &'static str,
    messages: &[ChatMessage],
) -> Result<ChatResponse> {
    let _permit = LLM_CHAT_GATE
        .acquire()
        .await
        .context("acquire LLM chat request gate")?;
    wait_for_llm_slot().await;
    let result = chat_complete_inner(client, profile, task_kind, messages).await;
    record_llm_result(&result).await;
    result
}

async fn chat_complete_inner(
    client: &reqwest::Client,
    profile: &LlmProfile,
    task_kind: &'static str,
    messages: &[ChatMessage],
) -> Result<ChatResponse> {
    let url = endpoint(&profile.base_url, "/chat/completions");
    let prompt_chars = request_chars(messages);
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
        tracing::error!(
            task_kind,
            model = %profile.chat_model,
            prompt_chars,
            status = %status,
            "AI request failed"
        );
        return Err(anyhow!(status_error_message(
            status,
            profile,
            &url,
            prompt_chars,
            request_shape,
            &text,
        )));
    }
    if text.trim().is_empty() {
        tracing::error!(
            task_kind,
            model = %profile.chat_model,
            prompt_chars,
            status = %status,
            "AI request returned empty body"
        );
        return Err(anyhow!(
            "LLM endpoint returned an empty response body for model `{}`; status={status}, url={}, stream=true, request_chars={}, content-type={}, content-length={}. The provider/proxy closed the request without JSON or SSE data",
            profile.chat_model,
            url,
            prompt_chars,
            header_value(&headers, "content-type"),
            header_value(&headers, "content-length"),
        ));
    }
    let parsed = match parse_response(&text) {
        Ok(parsed) => parsed,
        Err(error) => {
            tracing::error!(
                task_kind,
                model = %profile.chat_model,
                prompt_chars,
                status = %status,
                error = %error,
                "AI response decode failed"
            );
            return Err(error)
                .with_context(|| format!("decode chat response: {}", truncate(&text, 500)));
        }
    };
    tracing::info!(
        task_kind,
        model = %profile.chat_model,
        prompt_chars,
        prompt_tokens = parsed.usage.prompt_tokens,
        completion_tokens = parsed.usage.completion_tokens,
        finish_reason = ?parsed.finish_reason,
        response_chars = parsed.content.chars().count(),
        "AI request completed"
    );
    Ok(ChatResponse {
        content: parsed.content,
        finish_reason: parsed.finish_reason,
        prompt_tokens: parsed.usage.prompt_tokens,
        completion_tokens: parsed.usage.completion_tokens,
        model: profile.chat_model.clone(),
    })
}

#[derive(Default)]
struct LlmThrottle {
    next_allowed_at: Option<Instant>,
}

async fn wait_for_llm_slot() {
    let delay = {
        let throttle = LLM_CHAT_THROTTLE.lock().await;
        throttle
            .next_allowed_at
            .and_then(|instant| instant.checked_duration_since(Instant::now()))
    };
    if let Some(delay) = delay {
        tokio::time::sleep(delay).await;
    }
}

async fn record_llm_result(result: &Result<ChatResponse>) {
    let delay = if is_transient_capacity_error(result) {
        LLM_OVERLOAD_COOLDOWN
    } else {
        LLM_MIN_REQUEST_INTERVAL
    };
    let mut throttle = LLM_CHAT_THROTTLE.lock().await;
    throttle.next_allowed_at = Some(Instant::now() + delay);
}

fn is_transient_capacity_error(result: &Result<ChatResponse>) -> bool {
    result.as_ref().err().is_some_and(|error| {
        let text = format!("{error:#}");
        text.contains("system_cpu_overloaded")
            || text.contains("LLM provider is temporarily overloaded")
            || text.contains("LLM gateway timed out")
    })
}

fn status_error_message(
    status: reqwest::StatusCode,
    profile: &LlmProfile,
    url: &str,
    prompt_chars: usize,
    request_shape: request::RequestShape,
    text: &str,
) -> String {
    let provider_error = provider_error(text);
    let raw = truncate(text, 800);
    let details = format!(
        "model `{}`, url={url}, stream=true, request_chars={}, token_param={}, temperature={}",
        profile.chat_model,
        prompt_chars,
        request_shape.token_param_name(),
        request_shape.temperature_label(),
    );
    if status == reqwest::StatusCode::SERVICE_UNAVAILABLE && provider_error.is_overloaded() {
        return format!(
            "LLM provider is temporarily overloaded ({status}; {details}). Retry later or switch to another LLM profile/model. Provider response: {raw}"
        );
    }
    if is_gateway_timeout(status, text) {
        return format!(
            "LLM gateway timed out ({status}; {details}). The configured endpoint did not respond in time; keep requests serialized, retry later, or use a healthier endpoint. Provider response: {}",
            compact_error_body(text)
        );
    }
    format!(
        "LLM endpoint returned {status} ({details}): {}",
        compact_error_body(text)
    )
}

fn provider_error(text: &str) -> ProviderErrorSummary {
    serde_json::from_str::<ProviderErrorEnvelope>(text)
        .ok()
        .and_then(|envelope| envelope.error)
        .map(|error| ProviderErrorSummary {
            code: error.code.unwrap_or_default(),
            message: error.message.unwrap_or_default(),
        })
        .unwrap_or_default()
}

fn is_gateway_timeout(status: reqwest::StatusCode, text: &str) -> bool {
    status.as_u16() == 522 || text.contains("522: Connection timed out")
}

fn compact_error_body(text: &str) -> String {
    if text.contains("cloudflare") || text.contains("cf-error-details") {
        return html_title(text)
            .map(|title| format!("HTML error page: {title}"))
            .unwrap_or_else(|| "HTML error page".into());
    }
    truncate(text, 800)
}

fn html_title(text: &str) -> Option<String> {
    let start = text.find("<title>")? + "<title>".len();
    let end = text[start..].find("</title>")? + start;
    let title = text[start..end].trim();
    if title.is_empty() {
        return None;
    }
    Some(title.into())
}

#[derive(Debug, Deserialize)]
struct ProviderErrorEnvelope {
    error: Option<ProviderErrorBody>,
}

#[derive(Debug, Deserialize)]
struct ProviderErrorBody {
    message: Option<String>,
    code: Option<String>,
}

#[derive(Debug, Default)]
struct ProviderErrorSummary {
    code: String,
    message: String,
}

impl ProviderErrorSummary {
    fn is_overloaded(&self) -> bool {
        self.code == "system_cpu_overloaded" || self.message.contains("cpu overloaded")
    }
}
