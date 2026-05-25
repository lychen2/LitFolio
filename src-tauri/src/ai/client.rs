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
    stream: bool,
}

#[derive(Debug, Deserialize, Default)]
struct ChatRawResponse {
    #[serde(default)]
    choices: Vec<Choice>,
    #[serde(default)]
    usage: Option<Usage>,
}

#[derive(Debug, Deserialize, Default)]
struct Choice {
    #[serde(default)]
    message: Option<ChatMessage>,
    #[serde(default)]
    delta: Option<Delta>,
    #[serde(default)]
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
struct Delta {
    #[serde(default)]
    content: Option<String>,
    #[serde(default)]
    role: Option<String>,
}

#[derive(Debug, Deserialize, Default, Clone, Copy)]
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
        // Always stream. Standard providers (OpenAI / DeepSeek / Moonshot / SiliconFlow / Ollama)
        // all support stream:true and return SSE we know how to parse. Several Chinese gateway
        // proxies (new-api/one-api) silently return an empty metadata-only frame when stream:false
        // — gpt-5.4 via the songsongcard proxy was reproducible — so non-streaming is unreliable
        // in practice. The parser handles a single-JSON response too if a provider ignores the flag
        // and replies non-streaming anyway.
        stream: true,
    };
    let mut req = client.post(&url).json(&body);
    if !profile.api_key.is_empty() {
        req = req.bearer_auth(&profile.api_key);
    }
    let resp = req.send().await.with_context(|| format!("POST {url}"))?;
    let status = resp.status();
    let headers = resp.headers().clone();
    let text = resp.text().await.with_context(|| {
        format!(
            "read LLM response body for model `{}` from {url}",
            profile.chat_model
        )
    })?;
    if !status.is_success() {
        return Err(anyhow!(
            "LLM endpoint returned {status}: {}",
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

fn request_chars(messages: &[ChatMessage]) -> usize {
    messages.iter().map(|m| m.content.chars().count()).sum()
}

fn header_value(headers: &reqwest::header::HeaderMap, name: &str) -> String {
    headers
        .get(name)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("<missing>")
        .to_string()
}

#[derive(Debug)]
struct ParsedReply {
    content: String,
    finish_reason: Option<String>,
    usage: Usage,
}

/// Parse either a plain chat-completion JSON or an SSE stream body.
/// SSE detection: any line starts with `data:` — at that point we accumulate
/// delta.content (or message.content) across all chunks until `[DONE]`.
fn parse_response(text: &str) -> Result<ParsedReply> {
    let trimmed = text.trim_start();
    if trimmed.starts_with("data:") || trimmed.contains("\ndata:") {
        return parse_sse(text);
    }
    parse_plain(text)
}

fn parse_plain(text: &str) -> Result<ParsedReply> {
    let parsed: ChatRawResponse =
        serde_json::from_str(text).with_context(|| "decode chat response as JSON")?;
    let usage = parsed.usage.unwrap_or_default();
    let choice = parsed
        .choices
        .into_iter()
        .next()
        .ok_or_else(|| anyhow!("LLM returned no choices"))?;
    let content = choice
        .message
        .and_then(|m| Some(m.content))
        .or_else(|| choice.delta.as_ref().and_then(|d| d.content.clone()))
        .ok_or_else(|| anyhow!("LLM choice missing content"))?;
    Ok(ParsedReply {
        content,
        finish_reason: choice.finish_reason,
        usage,
    })
}

fn parse_sse(text: &str) -> Result<ParsedReply> {
    let mut content = String::new();
    let mut finish_reason: Option<String> = None;
    let mut usage = Usage::default();
    let mut any_data = false;
    for raw in text.lines() {
        let line = raw.trim();
        if !line.starts_with("data:") {
            continue;
        }
        any_data = true;
        let payload = line[5..].trim();
        if payload == "[DONE]" {
            break;
        }
        if payload.is_empty() {
            continue;
        }
        let chunk: ChatRawResponse = match serde_json::from_str(payload) {
            Ok(c) => c,
            Err(_) => continue, // skip frames we can't parse (proxy-injected metadata, comments)
        };
        if let Some(u) = chunk.usage {
            usage = u;
        }
        for ch in chunk.choices {
            if let Some(reason) = ch.finish_reason {
                finish_reason = Some(reason);
            }
            // Streaming providers put text in delta.content; some send a fully-formed
            // message in the first frame instead — handle both.
            if let Some(d) = ch.delta {
                if let Some(c) = d.content {
                    content.push_str(&c);
                }
            }
            if let Some(m) = ch.message {
                content.push_str(&m.content);
            }
        }
    }
    if !any_data {
        return Err(anyhow!("SSE body had no data: frames"));
    }
    if content.is_empty() && usage.completion_tokens == 0 && finish_reason.is_none() {
        return Err(anyhow!(
            "LLM stream returned no content (proxy may have rejected the request silently — check the model name and your account's allowed pool)"
        ));
    }
    Ok(ParsedReply {
        content,
        finish_reason,
        usage,
    })
}

fn endpoint(base_url: &str, path: &str) -> String {
    let trimmed = base_url.trim_end_matches('/');
    format!("{trimmed}{path}")
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_string();
    }
    let mut out: String = s.chars().take(max).collect();
    out.push_str("…");
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn endpoint_joins_correctly() {
        assert_eq!(
            endpoint("https://api.openai.com/v1", "/chat/completions"),
            "https://api.openai.com/v1/chat/completions"
        );
        assert_eq!(
            endpoint("http://localhost:11434/v1/", "/chat/completions"),
            "http://localhost:11434/v1/chat/completions"
        );
    }

    #[test]
    fn truncate_works() {
        assert_eq!(truncate("abc", 10), "abc");
        assert_eq!(truncate("abcdefghij", 5), "abcde…");
    }

    #[test]
    fn request_chars_sums_message_content() {
        let messages = vec![
            ChatMessage {
                role: "system".into(),
                content: "abc".into(),
            },
            ChatMessage {
                role: "user".into(),
                content: "你好".into(),
            },
        ];
        assert_eq!(request_chars(&messages), 5);
    }

    #[test]
    fn parse_plain_json_response() {
        let body = r#"{"id":"x","choices":[{"message":{"role":"assistant","content":"hello"},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":1,"total_tokens":4}}"#;
        let r = parse_response(body).unwrap();
        assert_eq!(r.content, "hello");
        assert_eq!(r.finish_reason.as_deref(), Some("stop"));
        assert_eq!(r.usage.completion_tokens, 1);
    }

    #[test]
    fn parse_sse_concatenates_deltas() {
        // shape new-api / OpenAI streams actually return
        let body = "\
data: {\"id\":\"r1\",\"choices\":[{\"index\":0,\"delta\":{\"role\":\"assistant\"}}]}\n\
\n\
data: {\"id\":\"r1\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"hel\"}}]}\n\
\n\
data: {\"id\":\"r1\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"lo\"},\"finish_reason\":\"stop\"}]}\n\
\n\
data: {\"id\":\"r1\",\"choices\":[],\"usage\":{\"prompt_tokens\":12,\"completion_tokens\":2,\"total_tokens\":14}}\n\
\n\
data: [DONE]\n";
        let r = parse_response(body).unwrap();
        assert_eq!(r.content, "hello");
        assert_eq!(r.finish_reason.as_deref(), Some("stop"));
        assert_eq!(r.usage.prompt_tokens, 12);
        assert_eq!(r.usage.completion_tokens, 2);
    }

    #[test]
    fn parse_sse_with_only_empty_metadata_frames_errors() {
        // The bug we shipped: proxy returns a metadata-only frame with empty choices
        // and 0 tokens. We must surface this as an error, not silent success.
        let body = "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":15,\"completion_tokens\":0,\"total_tokens\":15}}\n\ndata: [DONE]\n";
        let err = parse_response(body).unwrap_err();
        let msg = err.to_string();
        assert!(
            msg.contains("no content") || msg.contains("rejected"),
            "msg was: {msg}"
        );
    }
}
