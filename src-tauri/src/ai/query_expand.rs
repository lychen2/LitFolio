//! Topic-search query expansion: ask the LLM to turn a (possibly Chinese, possibly
//! broad) concept into a tight comma-separated list of precise English search terms
//! the field actually uses. Lets users like the one running this app search 'extreme
//! ultrafast pulse laser' and have the LLM surface 'attosecond, zeptosecond, ...'
//! before hitting Semantic Scholar.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

use super::client::{chat_complete_with_task_kind, ChatMessage};
use super::profile::LlmProfile;

#[derive(Debug, Clone, Serialize)]
pub struct ExpandedQuery {
    pub original: String,
    /// Single space-joined search string ready to send to the discovery API.
    pub expanded: String,
    /// Each term broken out, in case the UI wants to render them as removable chips.
    pub terms: Vec<String>,
    pub model: String,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
}

#[derive(Debug, Deserialize)]
struct LlmReply {
    #[serde(default)]
    terms: Vec<String>,
}

const SYSTEM_PROMPT: &str = "You translate broad research topics into precise English\
 search queries for academic-paper discovery (Semantic Scholar / arXiv).\n\n\
Rules:\n\
- Output 2 to 4 terms TOTAL. Less is more. Each term will run as a separate\n\
  search and the union dedupes papers, so loose synonyms only inflate noise.\n\
- Pick the terms a domain expert would actually type, not every adjacent\n\
  subfield. Resist the urge to add tangential keywords just because they\n\
  exist — broad ORs over-recall.\n\
- If two candidates would surface the same papers (e.g. \"attosecond pulses\"\n\
  and \"attosecond laser\"), keep only the more canonical one.\n\
- Always English. If the input is Chinese, translate first.\n\
- Each term must be a phrase the field actually uses in titles/abstracts —\n\
  include acronyms / canonical jargon when widely used.\n\
- Drop filler / vague words ('research', 'study', 'novel', 'recent').\n\
- One concept per term. No boolean operators inside a term.\n\n\
Reply with ONLY a JSON object, no prose, no markdown fence:\n\
{\"terms\": [\"term1\", \"term2\", \"term3\"]}";

pub async fn expand_search_query(
    client: &reqwest::Client,
    profile: &LlmProfile,
    raw: &str,
) -> Result<ExpandedQuery> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(anyhow::anyhow!("empty query"));
    }
    let messages = vec![
        ChatMessage {
            role: "system".into(),
            content: SYSTEM_PROMPT.into(),
        },
        ChatMessage {
            role: "user".into(),
            content: trimmed.into(),
        },
    ];
    let resp = chat_complete_with_task_kind(client, profile, "search_expand", &messages).await?;
    let parsed = parse_terms(&resp.content)
        .with_context(|| format!("LLM returned: {}", truncate(&resp.content, 300)))?;
    Ok(ExpandedQuery {
        original: trimmed.into(),
        expanded: parsed.join(" "),
        terms: parsed,
        model: resp.model,
        prompt_tokens: resp.prompt_tokens,
        completion_tokens: resp.completion_tokens,
    })
}

/// LLM responses are best-effort JSON. Strip common contamination (markdown fences,
/// pre/post chatter) and try a tolerant extraction.
fn parse_terms(content: &str) -> Result<Vec<String>> {
    // First try: direct JSON parse
    if let Ok(reply) = serde_json::from_str::<LlmReply>(content) {
        return Ok(clean_terms(reply.terms));
    }
    // Second try: pull the last {...} substring (reasoning/thinking text before JSON
    // could contain its own braces; we want the final JSON the model actually produced).
    if let (Some(lo), Some(hi)) = (content.rfind('{'), content.rfind('}')) {
        if hi > lo {
            let slice = &content[lo..=hi];
            if let Ok(reply) = serde_json::from_str::<LlmReply>(slice) {
                return Ok(clean_terms(reply.terms));
            }
        }
    }
    // Last resort: split by commas / newlines so the user still gets something useful
    let fallback: Vec<String> = content
        .split([',', '\n', ';'])
        .map(|s| {
            s.trim()
                .trim_matches(|c: char| !c.is_alphanumeric() && c != ' ' && c != '-')
                .to_string()
        })
        .filter(|s| !s.is_empty() && s.len() < 80)
        .collect();
    if fallback.is_empty() {
        return Err(anyhow::anyhow!(
            "could not extract any search terms from LLM reply"
        ));
    }
    Ok(clean_terms(fallback))
}

fn clean_terms(terms: Vec<String>) -> Vec<String> {
    terms
        .into_iter()
        .map(|t| t.trim().trim_matches('"').trim().to_string())
        .filter(|t| !t.is_empty())
        .take(4)
        .collect()
}

fn truncate(s: &str, n: usize) -> String {
    if s.chars().count() <= n {
        return s.into();
    }
    let mut out: String = s.chars().take(n).collect();
    out.push('…');
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_clean_json_response() {
        let r = r#"{"terms": ["attosecond pulse", "zeptosecond", "high-harmonic generation"]}"#;
        let t = parse_terms(r).unwrap();
        assert_eq!(t.len(), 3);
        assert_eq!(t[0], "attosecond pulse");
    }

    #[test]
    fn parse_json_inside_markdown_fence() {
        let r = "```json\n{\"terms\": [\"a\", \"b\"]}\n```";
        let t = parse_terms(r).unwrap();
        assert_eq!(t, vec!["a".to_string(), "b".to_string()]);
    }

    #[test]
    fn parse_with_leading_chatter() {
        let r = "Sure! Here are the terms:\n\n{\"terms\":[\"x\",\"y\",\"z\"]}";
        let t = parse_terms(r).unwrap();
        assert_eq!(t.len(), 3);
    }

    #[test]
    fn fallback_comma_split_when_json_unavailable() {
        let r = "attosecond pulse, zeptosecond physics, HHG";
        let t = parse_terms(r).unwrap();
        assert_eq!(t.len(), 3);
        assert_eq!(t[0], "attosecond pulse");
    }

    #[test]
    fn empty_reply_errors() {
        assert!(parse_terms("").is_err());
    }
}
