//! Topic Survey Phase 3 — annotate grounded papers (optional).
//!
//! Given subarea-grouped papers (typically the output of Phase 2 flattened by
//! the caller), ask the LLM to write a 1-2-sentence 中文 `why_important` note
//! per paper and flag 8-12 of them as `must_read=true` across all subareas.
//!
//! Phase 3 is optional — the caller is expected to swallow errors and ship the
//! survey without annotations rather than fail the whole request when this
//! one extra LLM call goes sideways.

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::client::{chat_complete_for_task, ChatMessage};
use super::profile::{LlmProfile, TaskKind};

#[derive(Debug, Clone, Serialize)]
pub struct AnnotateInputPaper {
    pub id: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub year: Option<i32>,
    #[serde(rename = "abstract", skip_serializing_if = "Option::is_none")]
    pub abstract_text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaperNote {
    pub why_important: String,
    pub must_read: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct SurveyAnnotation {
    /// paper_id (S2) → annotation. May be a subset of input papers if the LLM
    /// dropped some — callers should treat missing keys as "no annotation".
    pub paper_notes: HashMap<String, PaperNote>,
    pub must_read_ids: Vec<String>,
    pub model: String,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
}

const SYSTEM_PROMPT: &str =
    "You will annotate a list of papers that were retrieved from Semantic Scholar\n\
based on a topic survey plan you helped produce. For each paper, write:\n\
- why_important: 1-2 sentences in 中文, specific to what this paper proved/built\n\
- must_read: true if this is foundational or essential for the field\n\
\n\
Across all papers, mark exactly 8-12 as must_read=true. Choose for breadth\n\
(don't pile all must_reads into one subarea).\n\
\n\
Input format (you'll receive):\n\
[\n\
  {\"subarea\": \"<name>\", \"papers\": [\n\
    {\"id\": \"<s2 id>\", \"title\": \"...\", \"year\": ..., \"abstract\": \"...\"}\n\
  ]}\n\
]\n\
\n\
Output ONLY a JSON object:\n\
{\n\
  \"annotations\": {\n\
    \"<paper_id>\": {\"why_important\": \"...\", \"must_read\": true|false}\n\
  }\n\
}\n\
\n\
Rules:\n\
- Use the abstract to be specific. \"提出了 X 方法\" beats \"讨论了 X\".\n\
- If the abstract is missing/empty, still write one sentence about what\n\
  the title suggests.\n\
- must_read=true for ~30-40% of papers; not all of them.";

#[derive(Debug, Serialize)]
struct PromptSubarea<'a> {
    subarea: &'a str,
    papers: &'a [AnnotateInputPaper],
}

#[derive(Debug, Deserialize)]
struct AnnotationsReply {
    #[serde(default)]
    annotations: HashMap<String, RawNote>,
}

#[derive(Debug, Deserialize)]
struct RawNote {
    #[serde(default)]
    why_important: String,
    #[serde(default)]
    must_read: bool,
}

pub async fn annotate_survey(
    client: &reqwest::Client,
    profile: &LlmProfile,
    subareas: &[(String, Vec<AnnotateInputPaper>)],
) -> Result<SurveyAnnotation> {
    if subareas.is_empty() {
        return Err(anyhow!("no subareas to annotate"));
    }
    let total_papers: usize = subareas.iter().map(|(_, p)| p.len()).sum();
    if total_papers == 0 {
        return Err(anyhow!("no papers to annotate"));
    }
    let input: Vec<PromptSubarea> = subareas
        .iter()
        .map(|(name, papers)| PromptSubarea {
            subarea: name,
            papers,
        })
        .collect();
    let user_content =
        serde_json::to_string(&input).map_err(|e| anyhow!("serialize annotation input: {e}"))?;
    let messages = vec![
        ChatMessage {
            role: "system".into(),
            content: SYSTEM_PROMPT.into(),
        },
        ChatMessage {
            role: "user".into(),
            content: user_content,
        },
    ];
    let resp = chat_complete_for_task(client, profile, TaskKind::TopicSurvey, &messages).await?;
    let reply = parse_annotations(&resp.content)
        .with_context(|| format!("LLM returned: {}", truncate(&resp.content, 600)))?;
    if reply.annotations.is_empty() {
        return Err(anyhow!("LLM returned empty annotations object"));
    }
    let mut must_read_ids: Vec<String> = reply
        .annotations
        .iter()
        .filter(|(_, n)| n.must_read)
        .map(|(id, _)| id.clone())
        .collect();
    must_read_ids.sort();
    let paper_notes: HashMap<String, PaperNote> = reply
        .annotations
        .into_iter()
        .map(|(id, n)| {
            (
                id,
                PaperNote {
                    why_important: n.why_important.trim().to_string(),
                    must_read: n.must_read,
                },
            )
        })
        .collect();
    Ok(SurveyAnnotation {
        paper_notes,
        must_read_ids,
        model: resp.model,
        prompt_tokens: resp.prompt_tokens,
        completion_tokens: resp.completion_tokens,
    })
}

fn parse_annotations(raw: &str) -> Result<AnnotationsReply> {
    crate::ai::json_utils::parse_lenient::<AnnotationsReply>(raw)
        .map_err(|_| anyhow!("could not extract annotations JSON from LLM reply"))
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
    fn parses_clean_json() {
        let raw = r#"{
          "annotations": {
            "p1": {"why_important": "提出 CPA 啁啾脉冲放大。", "must_read": true},
            "p2": {"why_important": "首次实测 70 阿秒脉冲。", "must_read": false}
          }
        }"#;
        let r = parse_annotations(raw).unwrap();
        assert_eq!(r.annotations.len(), 2);
        assert_eq!(r.annotations["p1"].why_important, "提出 CPA 啁啾脉冲放大。");
        assert!(r.annotations["p1"].must_read);
        assert!(!r.annotations["p2"].must_read);
    }

    #[test]
    fn parses_markdown_fenced() {
        let raw =
            "```json\n{\"annotations\":{\"x\":{\"why_important\":\"a\",\"must_read\":true}}}\n```";
        let r = parse_annotations(raw).unwrap();
        assert!(r.annotations["x"].must_read);
    }

    #[test]
    fn parses_with_leading_chatter() {
        let raw = "Sure, here:\n{\"annotations\":{\"x\":{\"why_important\":\"a\",\"must_read\":false}}}\nDone!";
        let r = parse_annotations(raw).unwrap();
        assert_eq!(r.annotations["x"].why_important, "a");
    }

    #[test]
    fn missing_must_read_defaults_to_false() {
        let raw = r#"{"annotations":{"x":{"why_important":"a"}}}"#;
        let r = parse_annotations(raw).unwrap();
        assert!(!r.annotations["x"].must_read);
    }

    #[test]
    fn missing_why_important_defaults_to_empty() {
        let raw = r#"{"annotations":{"x":{"must_read":true}}}"#;
        let r = parse_annotations(raw).unwrap();
        assert_eq!(r.annotations["x"].why_important, "");
    }

    #[test]
    fn empty_annotations_object_parses_at_lexer_level() {
        // parse_annotations doesn't enforce non-empty — that's annotate_survey's job
        // after the parse so we can report the round-trip distinctly.
        let r = parse_annotations(r#"{"annotations":{}}"#).unwrap();
        assert!(r.annotations.is_empty());
    }

    #[test]
    fn malformed_json_errors() {
        let err = parse_annotations("totally garbage").unwrap_err();
        assert!(err.to_string().contains("could not extract"));
    }
}
