use super::{ChatMessage, LLM_REQUEST_TIMEOUT_SECS};

pub(super) fn request_chars(messages: &[ChatMessage]) -> usize {
    messages.iter().map(|m| m.content.chars().count()).sum()
}

pub(super) fn llm_request_timeout() -> std::time::Duration {
    std::time::Duration::from_secs(LLM_REQUEST_TIMEOUT_SECS)
}

pub(super) fn header_value(headers: &reqwest::header::HeaderMap, name: &str) -> String {
    headers
        .get(name)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("<missing>")
        .to_string()
}

pub(super) fn endpoint(base_url: &str, path: &str) -> String {
    let trimmed = base_url.trim_end_matches('/');
    format!("{trimmed}{path}")
}

pub(super) fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_string();
    }
    let mut out: String = s.chars().take(max).collect();
    out.push('…');
    out
}
