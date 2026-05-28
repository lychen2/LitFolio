//! Lenient JSON parsing for LLM responses.
//!
//! Models routinely wrap their JSON in prose ("Sure! Here you go: ```json\n…\n```")
//! or emit slightly malformed payloads (trailing commas, leading commentary).
//! Three call sites used to ship near-identical recovery code; they all funnel
//! through this module now so the recovery semantics stay consistent.

use anyhow::{anyhow, Result};
use serde::de::DeserializeOwned;

/// Strip a leading ` ```json ` / ` ``` ` fence and trailing ` ``` ` from a
/// fenced code block. Idempotent on non-fenced input.
pub fn strip_code_fence(raw: &str) -> &str {
    let s = raw.trim();
    let stripped = s
        .strip_prefix("```json")
        .or_else(|| s.strip_prefix("```"))
        .unwrap_or(s);
    stripped
        .trim_start_matches('\n')
        .trim_end_matches("```")
        .trim()
}

/// Try to parse `raw` as `T`, applying the standard LLM-response recovery:
/// strip Markdown code fences first; if that still fails, slice between the
/// first `{` and last `}` and retry. Returns `Err` only when even the
/// substring attempt cannot deserialize — at that point the response is too
/// malformed to salvage.
pub fn parse_lenient<T: DeserializeOwned>(raw: &str) -> Result<T> {
    let body = strip_code_fence(raw);
    if let Ok(parsed) = serde_json::from_str::<T>(body) {
        return Ok(parsed);
    }
    if let (Some(lo), Some(hi)) = (body.find('{'), body.rfind('}')) {
        if hi > lo {
            if let Ok(parsed) = serde_json::from_str::<T>(&body[lo..=hi]) {
                return Ok(parsed);
            }
        }
    }
    Err(anyhow!("could not parse JSON from model response"))
}

/// `parse_lenient` variant that always succeeds, returning `serde_json::json!({})`
/// when the response is unsalvageable. Useful when the caller has its own
/// best-effort path (e.g. reader_terms surfaces an empty definitions list
/// instead of erroring out).
pub fn parse_lenient_value(raw: &str) -> serde_json::Value {
    parse_lenient::<serde_json::Value>(raw).unwrap_or_else(|_| serde_json::json!({}))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Deserialize, PartialEq, Debug)]
    struct Item {
        name: String,
        count: i32,
    }

    #[test]
    fn strips_json_fence() {
        assert_eq!(strip_code_fence("```json\n{\"a\":1}\n```"), "{\"a\":1}");
        assert_eq!(strip_code_fence("```\n{\"a\":1}\n```"), "{\"a\":1}");
        assert_eq!(strip_code_fence("  {\"a\":1}  "), "{\"a\":1}");
    }

    #[test]
    fn parses_clean_json() {
        let raw = r#"{"name":"foo","count":3}"#;
        assert_eq!(
            parse_lenient::<Item>(raw).unwrap(),
            Item { name: "foo".into(), count: 3 }
        );
    }

    #[test]
    fn parses_fenced_json() {
        let raw = "Here's the answer:\n```json\n{\"name\":\"foo\",\"count\":3}\n```\nHope that helps!";
        // Direct parse fails (prose around), substring fallback succeeds.
        assert_eq!(
            parse_lenient::<Item>(raw).unwrap(),
            Item { name: "foo".into(), count: 3 }
        );
    }

    #[test]
    fn salvages_json_buried_in_prose() {
        let raw = "Sure thing — {\"name\":\"foo\",\"count\":3} is what you want.";
        assert_eq!(
            parse_lenient::<Item>(raw).unwrap(),
            Item { name: "foo".into(), count: 3 }
        );
    }

    #[test]
    fn errors_on_unsalvageable_response() {
        let raw = "the model refused to respond in JSON";
        assert!(parse_lenient::<Item>(raw).is_err());
    }

    #[test]
    fn lenient_value_returns_empty_object_on_failure() {
        let raw = "no JSON here";
        assert_eq!(parse_lenient_value(raw), serde_json::json!({}));
    }
}
