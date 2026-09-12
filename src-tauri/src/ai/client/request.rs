use anyhow::{bail, Result};
use serde::Serialize;

use super::ChatMessage;
use crate::ai::profile::{LlmProfile, ReasoningEffort, ThinkingFormat, ThinkingMode};

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
    #[serde(flatten)]
    pub(super) reasoning: ReasoningParams,
}

#[derive(Debug, Clone, Serialize, Default)]
pub(super) struct ReasoningParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    thinking: Option<ThinkingConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    enable_thinking: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    chat_template_kwargs: Option<ChatTemplate>,
    #[serde(skip_serializing_if = "Option::is_none")]
    reasoning_effort: Option<&'static str>,
}

#[derive(Debug, Clone, Serialize)]
struct ThinkingConfig {
    #[serde(rename = "type")]
    kind: &'static str,
}

#[derive(Debug, Clone, Serialize)]
struct ChatTemplate {
    enable_thinking: bool,
}

pub(super) fn reasoning_params(profile: &LlmProfile, task: &str) -> Result<ReasoningParams> {
    let model = profile.chat_model.to_ascii_lowercase();
    let url = reqwest::Url::parse(&profile.base_url).ok();
    let host = url.as_ref().and_then(|url| url.host_str()).unwrap_or("");
    let ollama = url.as_ref().and_then(|url| url.port()) == Some(11434);
    let format = match profile.thinking_format {
        ThinkingFormat::Auto => match host {
            "api.deepseek.com" if model.starts_with("deepseek-") => ThinkingFormat::Thinking,
            "api.moonshot.cn" | "api.moonshot.ai"
                if model.starts_with("kimi-k2.5") || model.starts_with("kimi-k2.6") =>
            {
                ThinkingFormat::Thinking
            }
            "api.siliconflow.cn" | "api.siliconflow.com" => ThinkingFormat::EnableThinking,
            "api.openai.com" if uses_completion_token_limit(&model) => {
                ThinkingFormat::ReasoningEffort
            }
            _ if ollama => ThinkingFormat::ReasoningEffort,
            _ => ThinkingFormat::Omit,
        },
        format => format,
    };
    let enabled = match profile.thinking_mode {
        ThinkingMode::Enabled => Some(true),
        ThinkingMode::Disabled => Some(false),
        ThinkingMode::Auto if profile.reasoning_effort != ReasoningEffort::Auto => Some(true),
        ThinkingMode::Auto if task == "translate" || !is_reasoning_model(&model) => Some(false),
        ThinkingMode::Auto => None,
    };
    let mut params = ReasoningParams::default();
    if format == ThinkingFormat::Omit {
        if profile.thinking_format == ThinkingFormat::Auto
            && (profile.thinking_mode != ThinkingMode::Auto
                || profile.reasoning_effort != ReasoningEffort::Auto)
        {
            bail!("Cannot infer this endpoint's thinking parameter format; select it in model settings or choose Omit to use server defaults");
        }
        return Ok(params);
    }
    let Some(enabled) = enabled else {
        return Ok(params);
    };
    if !enabled && profile.reasoning_effort != ReasoningEffort::Auto {
        bail!("Reasoning effort conflicts with disabled thinking; choose Auto effort or enable thinking");
    }
    let effort = match profile.reasoning_effort {
        ReasoningEffort::Auto | ReasoningEffort::Medium => "medium",
        ReasoningEffort::Low => "low",
        ReasoningEffort::High => "high",
    };
    if enabled
        && profile.reasoning_effort != ReasoningEffort::Auto
        && format != ThinkingFormat::ReasoningEffort
    {
        bail!("Reasoning effort requires the reasoning_effort parameter format; select Auto effort for this format");
    }
    match format {
        ThinkingFormat::Thinking => {
            params.thinking = Some(ThinkingConfig {
                kind: if enabled { "enabled" } else { "disabled" },
            })
        }
        ThinkingFormat::EnableThinking => params.enable_thinking = Some(enabled),
        ThinkingFormat::ChatTemplate => {
            params.chat_template_kwargs = Some(ChatTemplate {
                enable_thinking: enabled,
            })
        }
        ThinkingFormat::ReasoningEffort => {
            // GPT-5 (before 5.1), o-series, and GPT-OSS cannot disable reasoning.
            let cannot_disable = model.starts_with("o1")
                || model.starts_with("o3")
                || model.starts_with("o4")
                || model.starts_with("gpt-oss")
                || (model.starts_with("gpt-5") && !model.starts_with("gpt-5."));
            if !enabled && cannot_disable {
                if profile.thinking_mode == ThinkingMode::Disabled {
                    bail!(
                        "This model cannot disable reasoning; choose Auto or Enabled thinking mode"
                    );
                }
                return Ok(params);
            }
            params.reasoning_effort = Some(if enabled { effort } else { "none" });
        }
        ThinkingFormat::Auto | ThinkingFormat::Omit => unreachable!(),
    }
    Ok(params)
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
        temperature: if model.to_ascii_lowercase().starts_with("kimi-k2.") {
            None
        } else {
            Some(temperature)
        },
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
    lower.starts_with("gpt-5")
        || lower.starts_with("gpt-oss")
        || lower.contains("r1")
        || lower.contains("reasoner")
        || lower.starts_with("o1")
        || lower.starts_with("o3")
        || lower.starts_with("o4")
        || lower.contains("deep-think")
        || lower.contains("thinking")
}
