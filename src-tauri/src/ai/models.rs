//! GET /v1/models — discover the model ids the provider/proxy actually allows for this key.
//! Saves users from typo-ing model names and hitting "model_not_found" hours later.

use anyhow::{anyhow, Context, Result};
use serde::Deserialize;

use super::profile::LlmProfile;

#[derive(Debug, Deserialize)]
struct ModelsResponse {
    #[serde(default)]
    data: Vec<ModelEntry>,
}

#[derive(Debug, Deserialize)]
struct ModelEntry {
    id: String,
}

/// Returns the list of model ids returned by /v1/models for this profile's base_url + key.
/// Empty list is valid (a provider may return data: []).
pub async fn list_models(client: &reqwest::Client, profile: &LlmProfile) -> Result<Vec<String>> {
    let trimmed = profile.base_url.trim_end_matches('/');
    let url = format!("{trimmed}/models");
    let mut req = client.get(&url);
    if !profile.api_key.is_empty() {
        req = req.bearer_auth(&profile.api_key);
    }
    let resp = req.send().await.with_context(|| format!("GET {url}"))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(anyhow!(
            "models endpoint returned {status}: {}",
            truncate(&text, 400)
        ));
    }
    let parsed: ModelsResponse = serde_json::from_str(&text)
        .with_context(|| format!("decode models response: {}", truncate(&text, 300)))?;
    let mut ids: Vec<String> = parsed.data.into_iter().map(|m| m.id).collect();
    ids.sort();
    Ok(ids)
}

/// Pulls a model via Ollama-compatible /api/pull endpoint.
pub async fn pull_model(
    client: &reqwest::Client,
    profile: &LlmProfile,
    model: &str,
) -> Result<String> {
    let trimmed = profile.base_url.trim_end_matches('/');
    let host_url = if let Some(stripped) = trimmed.strip_suffix("/v1") {
        stripped
    } else {
        trimmed
    };
    let pull_url = format!("{host_url}/api/pull");
    let payload = serde_json::json!({
        "name": model,
        "stream": false
    });

    let mut req = client.post(&pull_url).json(&payload);
    if !profile.api_key.is_empty() {
        req = req.bearer_auth(&profile.api_key);
    }
    let resp = req.send().await.with_context(|| format!("POST {pull_url}"))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if status.is_success() {
        Ok(format!("模型 '{model}' 已下载就绪。"))
    } else if status == reqwest::StatusCode::NOT_FOUND {
        Err(anyhow!(
            "该服务地址不支持 /api/pull。在线云端服务（如 OpenAI、SiliconFlow 等）直接调用，无需在本地下载权重。"
        ))
    } else {
        Err(anyhow!(
            "拉取模型失败 ({status}): {}",
            truncate(&text, 300)
        ))
    }
}

fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_string();
    }
    let mut out: String = s.chars().take(max).collect();
    out.push('…');
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn truncate_caps_chars() {
        assert_eq!(truncate("abcdef", 3), "abc…");
        assert_eq!(truncate("abc", 10), "abc");
    }
}
