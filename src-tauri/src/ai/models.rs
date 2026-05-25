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
    fn truncate_caps_chars() {
        assert_eq!(truncate("abcdef", 3), "abc…");
        assert_eq!(truncate("abc", 10), "abc");
    }
}
