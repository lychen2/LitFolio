//! Paper summarization workflows: TL;DR + 4-section quick-read.

use anyhow::Result;
use serde::{Deserialize, Serialize};

use super::client::{chat_complete, ChatMessage};
use super::profile::LlmProfile;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TldrResult {
    pub tldr: String,
    pub key_findings: Vec<String>,
    pub model: String,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuickReadResult {
    pub problem: String,        // 1. What problem is being solved
    pub method: String,         // 2. Proposed approach
    pub comparison: String,     // 3. Difference from prior / competing work
    pub limitations: String,    // 4. Limitations vs full solution
    pub model: String,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
}

const TLDR_SYSTEM: &str = "You are a research assistant. Read the supplied paper metadata (title, authors, abstract) and produce a JSON object with these exact fields:\n\n{\n  \"tldr\": \"one sentence (<=40 words) capturing the paper's main contribution\",\n  \"key_findings\": [\"3 to 5 short bullets, each <=20 words\"]\n}\n\nReturn ONLY the JSON, no prose.";

const QUICKREAD_SYSTEM: &str = "You are a senior researcher reviewing a paper for a colleague who wants to decide whether to read it in depth. Read the supplied paper metadata (title, authors, abstract) and produce a JSON object that explains the paper's contribution and limits.\n\nFields (use plain prose paragraphs, NOT bullet lists, each 2-4 sentences):\n\n{\n  \"problem\":      \"What problem does the paper try to solve? Why is it hard or important? Be concrete.\",\n  \"method\":       \"What did the authors propose to solve it? Name the core technique, dataset, key design choices.\",\n  \"comparison\":   \"How is this different from prior or competing approaches? What advantage do the authors claim? Cite the prior approach by name if known.\",\n  \"limitations\":  \"What did the paper NOT solve, or what gaps remain to fully solve the problem? Include weaknesses the authors admit AND ones a critical reader would raise.\"\n}\n\nWrite in the same language as the abstract (Chinese abstract -> Chinese answer; English abstract -> English answer). Return ONLY the JSON object, no markdown fence, no prose around it.";

pub async fn summarize_paper_text(
    client: &reqwest::Client,
    profile: &LlmProfile,
    title: &str,
    authors: &[String],
    venue: Option<&str>,
    year: Option<i32>,
    abstract_text: Option<&str>,
    extra_context: Option<&str>,
) -> Result<TldrResult> {
    let user_content = format_user_prompt(title, authors, venue, year, abstract_text, extra_context);
    let resp = chat_complete(
        client,
        profile,
        &[
            ChatMessage { role: "system".into(), content: TLDR_SYSTEM.into() },
            ChatMessage { role: "user".into(), content: user_content },
        ],
    )
    .await?;
    let v = parse_json_lenient(&resp.content);
    let tldr = v.get("tldr").and_then(|x| x.as_str()).unwrap_or("").trim().to_string();
    let findings = v
        .get("key_findings")
        .and_then(|x| x.as_array())
        .map(|arr| arr.iter().filter_map(|x| x.as_str()).map(|s| s.trim().to_string()).collect())
        .unwrap_or_default();
    Ok(TldrResult {
        tldr,
        key_findings: findings,
        model: resp.model,
        prompt_tokens: resp.prompt_tokens,
        completion_tokens: resp.completion_tokens,
    })
}

pub async fn quick_read_paper_text(
    client: &reqwest::Client,
    profile: &LlmProfile,
    title: &str,
    authors: &[String],
    venue: Option<&str>,
    year: Option<i32>,
    abstract_text: Option<&str>,
    extra_context: Option<&str>,
) -> Result<QuickReadResult> {
    let user_content = format_user_prompt(title, authors, venue, year, abstract_text, extra_context);
    let resp = chat_complete(
        client,
        profile,
        &[
            ChatMessage { role: "system".into(), content: QUICKREAD_SYSTEM.into() },
            ChatMessage { role: "user".into(), content: user_content },
        ],
    )
    .await?;
    let v = parse_json_lenient(&resp.content);
    Ok(QuickReadResult {
        problem: v.get("problem").and_then(|x| x.as_str()).unwrap_or("").trim().to_string(),
        method: v.get("method").and_then(|x| x.as_str()).unwrap_or("").trim().to_string(),
        comparison: v.get("comparison").and_then(|x| x.as_str()).unwrap_or("").trim().to_string(),
        limitations: v.get("limitations").and_then(|x| x.as_str()).unwrap_or("").trim().to_string(),
        model: resp.model,
        prompt_tokens: resp.prompt_tokens,
        completion_tokens: resp.completion_tokens,
    })
}

fn format_user_prompt(
    title: &str, authors: &[String], venue: Option<&str>, year: Option<i32>,
    abstract_text: Option<&str>, extra: Option<&str>,
) -> String {
    let mut s = String::new();
    s.push_str(&format!("Title: {title}\n"));
    if !authors.is_empty() {
        let head: Vec<_> = authors.iter().take(6).cloned().collect();
        s.push_str(&format!("Authors: {}{}\n", head.join(", "), if authors.len() > 6 { " et al." } else { "" }));
    }
    if let Some(v) = venue { s.push_str(&format!("Venue: {v}\n")); }
    if let Some(y) = year  { s.push_str(&format!("Year: {y}\n")); }
    if let Some(a) = abstract_text {
        s.push_str("\nAbstract:\n");
        s.push_str(a);
    } else {
        s.push_str("\n(No abstract available; infer from title.)");
    }
    if let Some(e) = extra { s.push_str("\n\nAdditional context:\n"); s.push_str(e); }
    s
}

pub(crate) fn parse_json_lenient(raw: &str) -> serde_json::Value {
    let trimmed = raw.trim();
    let body = strip_code_fence(trimmed);
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(body) {
        return v;
    }
    // Sometimes the model wraps with leading prose: extract the first {...} block.
    if let (Some(s), Some(e)) = (body.find('{'), body.rfind('}')) {
        if s < e {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&body[s..=e]) {
                return v;
            }
        }
    }
    serde_json::json!({})
}

fn strip_code_fence(s: &str) -> &str {
    let s = s.trim();
    let stripped = s.strip_prefix("```json").or_else(|| s.strip_prefix("```")).unwrap_or(s);
    stripped.trim_start_matches('\n').trim_end_matches("```").trim()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tldr_parses_clean_json() {
        let raw = r#"{"tldr":"Foo bar.","key_findings":["a","b","c"]}"#;
        let v = parse_json_lenient(raw);
        assert_eq!(v["tldr"], "Foo bar.");
        assert_eq!(v["key_findings"][1], "b");
    }

    #[test]
    fn tldr_parses_fenced_json() {
        let raw = "```json\n{\"tldr\":\"X\",\"key_findings\":[\"y\"]}\n```";
        let v = parse_json_lenient(raw);
        assert_eq!(v["tldr"], "X");
    }

    #[test]
    fn quickread_parses_four_fields() {
        let raw = r#"{"problem":"P","method":"M","comparison":"C","limitations":"L"}"#;
        let v = parse_json_lenient(raw);
        assert_eq!(v["problem"], "P");
        assert_eq!(v["comparison"], "C");
    }

    #[test]
    fn parses_prose_wrapped_json() {
        let raw = "Sure, here you go:\n{\"problem\":\"yes\"}\nThanks!";
        let v = parse_json_lenient(raw);
        assert_eq!(v["problem"], "yes");
    }
}
