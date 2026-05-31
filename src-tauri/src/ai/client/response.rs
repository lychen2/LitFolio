use anyhow::{anyhow, Context, Result};
use serde::Deserialize;

use super::ChatMessage;

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
    reasoning_content: Option<String>,
}

#[derive(Debug, Deserialize, Default, Clone, Copy)]
pub(super) struct Usage {
    #[serde(default)]
    pub(super) prompt_tokens: u32,
    #[serde(default)]
    pub(super) completion_tokens: u32,
}

#[derive(Debug)]
pub(super) struct ParsedReply {
    pub(super) content: String,
    pub(super) finish_reason: Option<String>,
    pub(super) usage: Usage,
}

pub(super) fn parse_response(text: &str) -> Result<ParsedReply> {
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
        .map(|m| m.content)
        .or_else(|| choice.delta.as_ref().and_then(|d| d.content.clone()))
        .ok_or_else(|| anyhow!("LLM choice missing content"))?;
    Ok(ParsedReply {
        content,
        finish_reason: choice.finish_reason,
        usage,
    })
}

fn parse_sse(text: &str) -> Result<ParsedReply> {
    let mut acc = SseAccumulator::default();
    for raw in text.lines() {
        let line = raw.trim();
        if !line.starts_with("data:") {
            continue;
        }
        acc.any_data = true;
        let payload = line[5..].trim();
        if payload == "[DONE]" {
            break;
        }
        acc.push_payload(payload)
            .with_context(|| "decode SSE data frame")?;
    }
    acc.into_reply()
}

#[derive(Default)]
struct SseAccumulator {
    content: String,
    thought: String,
    finish_reason: Option<String>,
    usage: Usage,
    any_data: bool,
}

impl SseAccumulator {
    fn push_payload(&mut self, payload: &str) -> Result<()> {
        if payload.is_empty() {
            return Ok(());
        }
        let chunk: ChatRawResponse = serde_json::from_str(payload)?;
        if let Some(u) = chunk.usage {
            self.usage = u;
        }
        for ch in chunk.choices {
            self.push_choice(ch);
        }
        Ok(())
    }

    fn push_choice(&mut self, choice: Choice) {
        if let Some(reason) = choice.finish_reason {
            self.finish_reason = Some(reason);
        }
        if let Some(d) = choice.delta {
            self.push_delta(d);
        }
        if let Some(m) = choice.message {
            self.content.push_str(&m.content);
        }
    }

    fn push_delta(&mut self, delta: Delta) {
        if let Some(c) = delta.content {
            self.content.push_str(&c);
        }
        if let Some(r) = delta.reasoning_content {
            self.thought.push_str(&r);
        }
    }

    fn into_reply(mut self) -> Result<ParsedReply> {
        if !self.any_data {
            return Err(anyhow!("SSE body had no data: frames"));
        }
        if self.content.is_empty() && !self.thought.is_empty() {
            self.content = self.thought;
        }
        Ok(ParsedReply {
            content: self.content,
            finish_reason: self.finish_reason,
            usage: self.usage,
        })
    }
}
