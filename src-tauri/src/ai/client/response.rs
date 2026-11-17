use anyhow::{anyhow, Context, Result};
use serde::Deserialize;

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
    message: Option<Delta>,
    #[serde(default)]
    delta: Option<Delta>,
    #[serde(default)]
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
struct Delta {
    #[serde(default)]
    content: Option<String>,
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
    let mut reply = if trimmed.starts_with("data:") || trimmed.contains("\ndata:") {
        parse_sse(text)?
    } else {
        parse_plain(text)?
    };
    reply.content = strip_think_tags(&reply.content);
    if reply.content.is_empty()
        && !reply.finish_reason.as_deref().is_some_and(|reason| {
            reason.eq_ignore_ascii_case("length") || reason.eq_ignore_ascii_case("max_tokens")
        })
    {
        return Err(anyhow!(
            "LLM returned no final answer (finish_reason={:?}, prompt_tokens={}, completion_tokens={}); check output limit and thinking mode",
            reply.finish_reason,
            reply.usage.prompt_tokens,
            reply.usage.completion_tokens,
        ));
    }
    Ok(reply)
}

/// Remove tagged reasoning after assembling SSE chunks, including truncated blocks.
pub(crate) fn strip_think_tags(text: &str) -> String {
    let lower = text.to_ascii_lowercase();
    let tags = [
        ("<think>", true),
        ("</think>", false),
        ("<thinking>", true),
        ("</thinking>", false),
    ];
    let mut out = String::new();
    let mut cursor = 0;
    let mut depth: usize = 0;
    while let Some((start, tag, opening)) = tags
        .iter()
        .filter_map(|(tag, opening)| {
            lower[cursor..]
                .find(tag)
                .map(|index| (cursor + index, *tag, *opening))
        })
        .min_by_key(|(index, _, _)| *index)
    {
        if depth == 0 {
            out.push_str(&text[cursor..start]);
        }
        if opening {
            depth += 1;
        } else if depth == 0 {
            // Some templates prefill the opening tag and return only its closing tag.
            out.clear();
        } else {
            depth -= 1;
        }
        cursor = start + tag.len();
    }
    if depth == 0 {
        let tail = &text[cursor..];
        let partial = tail.rfind('<').filter(|index| {
            let suffix = tail[*index..].to_ascii_lowercase();
            tags.iter().any(|(tag, _)| tag.starts_with(&suffix))
        });
        out.push_str(&tail[..partial.unwrap_or(tail.len())]);
    }
    out.trim().to_string()
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
        .and_then(|m| m.content)
        .or_else(|| choice.delta.as_ref().and_then(|d| d.content.clone()))
        .unwrap_or_default();
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
            self.push_delta(m);
        }
    }

    fn push_delta(&mut self, delta: Delta) {
        if let Some(c) = delta.content {
            self.content.push_str(&c);
        }
    }

    fn into_reply(self) -> Result<ParsedReply> {
        if !self.any_data {
            return Err(anyhow!("SSE body had no data: frames"));
        }
        Ok(ParsedReply {
            content: self.content,
            finish_reason: self.finish_reason,
            usage: self.usage,
        })
    }
}
