use serde::Serialize;

use super::ChatMessage;

#[derive(Debug, Clone, Serialize)]
pub(super) struct ChatRequest<'a> {
    pub(super) model: &'a str,
    pub(super) messages: &'a [ChatMessage],
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) temperature: Option<f32>,
    pub(super) stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) max_completion_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) thinking: Option<ThinkingConfig>,
}

#[derive(Debug, Clone, Serialize)]
pub(super) struct ThinkingConfig {
    #[serde(rename = "type")]
    pub(super) r#type: String,
}

#[derive(Debug, Clone, Copy)]
pub(super) struct RequestShape {
    pub(super) temperature: Option<f32>,
    pub(super) max_tokens: Option<u32>,
    pub(super) max_completion_tokens: Option<u32>,
}

impl RequestShape {
    pub(super) fn token_param_name(self) -> &'static str {
        if self.max_completion_tokens.is_some() {
            "max_completion_tokens"
        } else {
            "max_tokens"
        }
    }

    pub(super) fn temperature_label(self) -> &'static str {
        if self.temperature.is_some() {
            "sent"
        } else {
            "omitted"
        }
    }
}

pub(super) fn request_shape(model: &str, max_tokens: u32, temperature: f32) -> RequestShape {
    if uses_completion_token_limit(model) {
        return RequestShape {
            temperature: None,
            max_tokens: None,
            max_completion_tokens: Some(max_tokens),
        };
    }
    RequestShape {
        temperature: Some(temperature),
        max_tokens: Some(max_tokens),
        max_completion_tokens: None,
    }
}

fn uses_completion_token_limit(model: &str) -> bool {
    let lower = model.to_ascii_lowercase();
    lower.starts_with("gpt-5")
        || lower.starts_with("o1")
        || lower.starts_with("o3")
        || lower.starts_with("o4")
}

pub(super) fn is_reasoning_model(model: &str) -> bool {
    let lower = model.to_ascii_lowercase();
    lower.contains("r1")
        || lower.contains("reasoner")
        || lower.starts_with("o1")
        || lower.starts_with("o3")
        || lower.starts_with("o4")
        || lower.contains("deep-think")
        || lower.contains("thinking")
}
