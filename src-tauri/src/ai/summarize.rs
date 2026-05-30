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
    pub problem: String,     // 1. What problem is being solved
    pub method: String,      // 2. Proposed approach
    pub comparison: String,  // 3. Difference from prior / competing work
    pub limitations: String, // 4. Limitations vs full solution
    pub model: String,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
}

const TLDR_SYSTEM: &str = "You are a research assistant. Read the supplied paper (title, authors, abstract, and — when present — a head+tail excerpt of the full PDF body) and produce a JSON object with these exact fields:\n\n{\n  \"tldr\": \"one sentence (<=40 words) capturing the paper's main contribution\",\n  \"key_findings\": [\"3 to 5 short bullets, each <=20 words\"]\n}\n\nWhen body text is provided, ground every claim in it; the body may be truncated, so do not assume you saw the entire paper. Return ONLY the JSON, no prose. Use the requested output language.";

const QUICKREAD_SYSTEM: &str = "You are a senior researcher reviewing a paper for a colleague who wants to decide whether to read it in depth. Read the supplied paper (title, authors, abstract, and — when present — a head+tail excerpt of the full PDF body) and produce a JSON object that explains the paper's contribution and limits.\n\nFields (use plain prose paragraphs, NOT bullet lists, each 2-4 sentences):\n\n{\n  \"problem\":      \"What problem does the paper try to solve? Why is it hard or important? Be concrete.\",\n  \"method\":       \"What did the authors propose to solve it? Name the core technique, dataset, key design choices.\",\n  \"comparison\":   \"How is this different from prior or competing approaches? What advantage do the authors claim? Cite the prior approach by name if known.\",\n  \"limitations\":  \"What did the paper NOT solve, or what gaps remain to fully solve the problem? Include weaknesses the authors admit AND ones a critical reader would raise.\"\n}\n\nWhen body text is provided, prefer evidence from it over speculation; the body may be truncated, so do not invent details about sections you cannot see. Use the requested output language for every field. Return ONLY the JSON object, no markdown fence, no prose around it.";

/// Character budget for PDF body text sent to the LLM. Large enough to fit
/// a typical research paper (~10–20k tokens once the abstract and metadata
/// are accounted for), small enough to leave room for the system prompt
/// and JSON output without blowing past 32k-context model windows.
pub const PDF_BODY_BUDGET_CHARS: usize = 60_000;

/// Truncate body text to roughly `PDF_BODY_BUDGET_CHARS` codepoints,
/// keeping the head (intro + method) and tail (conclusion + limitations)
/// while dropping the middle. Returns the original string unchanged when
/// it already fits — the fast path avoids the O(n) `chars().count()` walk
/// since UTF-8 char count is bounded above by byte length.
pub fn fit_pdf_body(text: &str) -> String {
    if text.len() <= PDF_BODY_BUDGET_CHARS {
        return text.to_string();
    }
    let total = text.chars().count();
    if total <= PDF_BODY_BUDGET_CHARS {
        return text.to_string();
    }
    let head_chars = (PDF_BODY_BUDGET_CHARS * 7) / 10;
    let tail_chars = PDF_BODY_BUDGET_CHARS - head_chars;
    let head: String = text.chars().take(head_chars).collect();
    let tail: String = text.chars().skip(total - tail_chars).collect();
    let omitted = total - head_chars - tail_chars;
    format!("{head}\n\n[... {omitted} characters truncated ...]\n\n{tail}")
}

pub async fn summarize_paper_text(
    client: &reqwest::Client,
    profile: &LlmProfile,
    title: &str,
    authors: &[String],
    venue: Option<&str>,
    year: Option<i32>,
    abstract_text: Option<&str>,
    body_text: Option<&str>,
    extra_context: Option<&str>,
    output_language: &str,
) -> Result<TldrResult> {
    let user_content = format_user_prompt(
        title,
        authors,
        venue,
        year,
        abstract_text,
        body_text,
        extra_context,
        output_language,
    );
    let resp = chat_complete(
        client,
        profile,
        &[
            ChatMessage {
                role: "system".into(),
                content: TLDR_SYSTEM.into(),
            },
            ChatMessage {
                role: "user".into(),
                content: user_content,
            },
        ],
    )
    .await?;
    let v = parse_json_lenient(&resp.content);
    let tldr = v
        .get("tldr")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let findings = v
        .get("key_findings")
        .and_then(|x| x.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|x| x.as_str())
                .map(|s| s.trim().to_string())
                .collect()
        })
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
    body_text: Option<&str>,
    extra_context: Option<&str>,
    output_language: &str,
) -> Result<QuickReadResult> {
    let user_content = format_user_prompt(
        title,
        authors,
        venue,
        year,
        abstract_text,
        body_text,
        extra_context,
        output_language,
    );
    let resp = chat_complete(
        client,
        profile,
        &[
            ChatMessage {
                role: "system".into(),
                content: QUICKREAD_SYSTEM.into(),
            },
            ChatMessage {
                role: "user".into(),
                content: user_content,
            },
        ],
    )
    .await?;
    let v = parse_json_lenient(&resp.content);
    Ok(QuickReadResult {
        problem: v
            .get("problem")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .trim()
            .to_string(),
        method: v
            .get("method")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .trim()
            .to_string(),
        comparison: v
            .get("comparison")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .trim()
            .to_string(),
        limitations: v
            .get("limitations")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .trim()
            .to_string(),
        model: resp.model,
        prompt_tokens: resp.prompt_tokens,
        completion_tokens: resp.completion_tokens,
    })
}

fn format_user_prompt(
    title: &str,
    authors: &[String],
    venue: Option<&str>,
    year: Option<i32>,
    abstract_text: Option<&str>,
    body_text: Option<&str>,
    extra: Option<&str>,
    output_language: &str,
) -> String {
    let mut s = String::new();
    s.push_str(&format!("Output language: {output_language}\n"));
    s.push_str(&format!("Title: {title}\n"));
    if !authors.is_empty() {
        let head: Vec<_> = authors.iter().take(6).cloned().collect();
        s.push_str(&format!(
            "Authors: {}{}\n",
            head.join(", "),
            if authors.len() > 6 { " et al." } else { "" }
        ));
    }
    if let Some(v) = venue {
        s.push_str(&format!("Venue: {v}\n"));
    }
    if let Some(y) = year {
        s.push_str(&format!("Year: {y}\n"));
    }
    if let Some(a) = abstract_text {
        s.push_str("\nAbstract:\n");
        s.push_str(a);
    } else {
        s.push_str("\n(No abstract available; infer from title.)");
    }
    if let Some(body) = body_text.map(str::trim).filter(|b| !b.is_empty()) {
        let fitted = fit_pdf_body(body);
        s.push_str("\n\nFull text (extracted from PDF; may be a head+tail excerpt if the paper was long):\n");
        s.push_str(&fitted);
    }
    if let Some(e) = extra {
        s.push_str("\n\nAdditional context:\n");
        s.push_str(e);
    }
    s
}

pub(crate) fn parse_json_lenient(raw: &str) -> serde_json::Value {
    let trimmed = raw.trim();
    let body = strip_code_fence(trimmed);
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(body) {
        return v;
    }
    // Reasoning/thinking content may contain braces that interfere with
    // extraction. Pick the *last* {…} block, which is the actual response.
    if let Some(end) = body.rfind('}') {
        if let Some(start) = body[..end].rfind('{') {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&body[start..=end]) {
                return v;
            }
        }
    }
    serde_json::json!({})
}

fn strip_code_fence(s: &str) -> &str {
    let s = s.trim();
    let stripped = s
        .strip_prefix("```json")
        .or_else(|| s.strip_prefix("```"))
        .unwrap_or(s);
    stripped
        .trim_start_matches('\n')
        .trim_end_matches("```")
        .trim()
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

    #[test]
    fn fit_pdf_body_passes_short_text_through_unchanged() {
        let short = "abc".repeat(100);
        assert_eq!(fit_pdf_body(&short), short);
    }

    #[test]
    fn fit_pdf_body_truncates_with_head_and_tail() {
        let total = PDF_BODY_BUDGET_CHARS * 2;
        let body: String = (0..total)
            .map(|i| (b'a' + (i % 26) as u8) as char)
            .collect();
        let fitted = fit_pdf_body(&body);
        // Truncated output must be shorter than input (large enough margin to
        // accommodate the marker text) and must contain the truncation marker.
        assert!(fitted.chars().count() < total);
        assert!(fitted.contains("truncated"));
        // First few chars should match the original head; last few should
        // match the original tail — proves we kept both ends, not the middle.
        let original_head: String = body.chars().take(50).collect();
        let original_tail: String = body
            .chars()
            .rev()
            .take(50)
            .collect::<String>()
            .chars()
            .rev()
            .collect();
        assert!(fitted.starts_with(&original_head));
        assert!(fitted.ends_with(&original_tail));
    }

    #[test]
    fn fit_pdf_body_handles_multibyte_chars_without_panicking() {
        // PDF_BODY_BUDGET_CHARS + 100 Chinese characters = 3× bytes, exceeds
        // both the byte fast-path AND the char budget — must truncate, must
        // not panic at UTF-8 boundaries.
        let body: String = "字".repeat(PDF_BODY_BUDGET_CHARS + 100);
        let fitted = fit_pdf_body(&body);
        assert!(fitted.chars().count() < body.chars().count());
        assert!(fitted.contains("truncated"));
    }

    #[test]
    fn fit_pdf_body_keeps_input_when_bytes_exceed_budget_but_chars_do_not() {
        // 30k Chinese chars = 90k bytes (over the byte fast-path) but only
        // 30k codepoints — well under the 60k char budget. The function
        // should fall back to the char-count check and return unchanged.
        let body: String = "字".repeat(PDF_BODY_BUDGET_CHARS / 2);
        let fitted = fit_pdf_body(&body);
        assert_eq!(fitted, body);
    }
}
