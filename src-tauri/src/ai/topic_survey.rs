//! Topic Survey Phase 1 — LLM survey skeleton.
//!
//! Given a (possibly Chinese) research topic, ask the LLM to decompose the
//! field into 4-7 subareas: each with a 中文 narrative, an inclusive year
//! range, 2-4 English S2-ready search terms, and optional PI hints. The LLM
//! emits NO papers — real papers are fetched in Phase 2 by
//! `ingest::topic_survey_retrieval` using the produced `search_terms`.
//!
//! This deliberate two-phase split exists because asking the LLM to emit
//! papers directly hallucinates DOIs / years / authors. The LLM only plans.

use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Deserializer, Serialize};

use super::client::{chat_complete, ChatMessage};
use super::profile::LlmProfile;

#[cfg(test)]
mod tests;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SurveySkeleton {
    #[serde(default)]
    pub subareas: Vec<SubareaSpec>,
    #[serde(default)]
    pub key_pis: Vec<PiHint>,
    // LLM-call metadata — not in the model's JSON output, filled by plan_survey().
    #[serde(default)]
    pub model: String,
    #[serde(default)]
    pub prompt_tokens: u32,
    #[serde(default)]
    pub completion_tokens: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubareaSpec {
    pub name: String,
    /// Inclusive `(start, end)` years. Tolerant of null / missing / weird shapes.
    #[serde(default, deserialize_with = "deser_year_range")]
    pub year_range: Option<(i32, i32)>,
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub search_terms: Vec<String>,
    #[serde(default)]
    pub pi_hints: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PiHint {
    pub name: String,
    #[serde(default)]
    pub why_central: String,
}

const SYSTEM_PROMPT: &str =
    "You are a domain expert helping a PhD student plan a literature survey.\n\
The user gave you a (possibly Chinese) research topic.\n\
\n\
You will NOT list any specific papers — another tool will fetch real papers\n\
from Semantic Scholar based on the plan you produce. Your job is to:\n\
\n\
1. Decompose the field into 4-7 subareas, ordered historically OR by\n\
   technique (you decide which makes more sense for this topic).\n\
2. For each subarea write a one-paragraph narrative summary (in 中文)\n\
   explaining what this subarea contributed and why it matters.\n\
3. For each subarea provide 2-4 English search terms that an academic\n\
   search engine would use to surface the right papers. Be specific —\n\
   \"ultrafast laser\" is too broad; prefer \"high-harmonic generation\",\n\
   \"carrier-envelope phase\", etc. These terms will be passed verbatim\n\
   to Semantic Scholar.\n\
4. Optionally name 1-3 PI / senior authors per subarea (in pi_hints) —\n\
   we'll search S2 for their work in addition to the topic terms.\n\
5. List 5-10 key_pis across the whole field with a one-line note on\n\
   why each one is central.\n\
\n\
Output ONLY a JSON object — no markdown fence, no prose:\n\
\n\
{\n\
  \"subareas\": [\n\
    {\n\
      \"name\": \"<English subarea name>\",\n\
      \"year_range\": [<start_int>, <end_int>],\n\
      \"summary\": \"<one paragraph in 中文>\",\n\
      \"search_terms\": [\"<English term>\", ...],\n\
      \"pi_hints\": [\"<full name>\", ...]\n\
    }\n\
  ],\n\
  \"key_pis\": [\n\
    {\"name\": \"<full name>\", \"why_central\": \"<one-line in 中文>\"}\n\
  ]\n\
}\n\
\n\
Rules:\n\
- 中文 in summary / why_central; English in search_terms; PI names native.\n\
- Resist over-broad search terms — each term should return 20-200 papers,\n\
  not 20,000.\n\
- Don't invent terms. Use vocabulary actually used in titles/abstracts.\n\
- year_range is inclusive; pick the era the subarea was most active.";

pub async fn plan_survey(
    client: &reqwest::Client,
    profile: &LlmProfile,
    topic: &str,
) -> Result<SurveySkeleton> {
    let trimmed = topic.trim();
    if trimmed.is_empty() {
        return Err(anyhow!("empty topic"));
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
    let resp = chat_complete(client, profile, &messages).await?;
    let mut skel = parse_skeleton(&resp.content).with_context(|| {
        if resp.finish_reason.as_deref() == Some("length") {
            return format!(
                "LLM stopped because the provider exhausted the output budget. \
Use a model with a larger output budget. LLM returned: {}",
                truncate(&resp.content, 600)
            );
        }
        format!(
            "finish_reason={:?}, completion_tokens={}, reply_chars={}, reply_preview={}",
            resp.finish_reason,
            resp.completion_tokens,
            resp.content.chars().count(),
            truncate(&resp.content, 600),
        )
    })?;
    skel.model = resp.model;
    skel.prompt_tokens = resp.prompt_tokens;
    skel.completion_tokens = resp.completion_tokens;
    if skel.subareas.is_empty() {
        return Err(anyhow!(
            "LLM returned zero usable subareas; topic may be too vague or the model rejected it"
        ));
    }
    Ok(skel)
}

/// Tolerant JSON extraction: strips markdown fences first, then falls back to
/// the first `{…}` substring when the model wraps the JSON in prose. Failure
/// emits a topic-specific error so the survey screen can show actionable text.
fn parse_skeleton(raw: &str) -> Result<SurveySkeleton> {
    match crate::ai::json_utils::parse_lenient::<SurveySkeleton>(raw) {
        Ok(s) => Ok(sanitize(s)),
        Err(_) => Err(anyhow!(
            "could not parse survey skeleton JSON: expected an object with subareas[] and key_pis[]"
        )),
    }
}

/// Trim whitespace, cap list lengths, drop unusable subareas. A subarea with
/// no search_terms can't be grounded in Phase 2 so we discard it here rather
/// than fail later — keeps the overall survey usable even if the LLM blanked
/// one entry.
fn sanitize(mut s: SurveySkeleton) -> SurveySkeleton {
    for sa in &mut s.subareas {
        sa.name = sa.name.trim().to_string();
        sa.summary = sa.summary.trim().to_string();
        sa.search_terms = sa
            .search_terms
            .iter()
            .map(|t| t.trim().to_string())
            .filter(|t| !t.is_empty())
            .take(4)
            .collect();
        sa.pi_hints = sa
            .pi_hints
            .iter()
            .map(|p| p.trim().to_string())
            .filter(|p| !p.is_empty())
            .take(3)
            .collect();
    }
    s.subareas
        .retain(|sa| !sa.name.is_empty() && !sa.summary.is_empty() && !sa.search_terms.is_empty());
    for p in &mut s.key_pis {
        p.name = p.name.trim().to_string();
        p.why_central = p.why_central.trim().to_string();
    }
    s.key_pis.retain(|p| !p.name.is_empty());
    s
}

fn deser_year_range<'de, D>(d: D) -> std::result::Result<Option<(i32, i32)>, D::Error>
where
    D: Deserializer<'de>,
{
    let v = serde_json::Value::deserialize(d)?;
    Ok(extract_year_range(&v))
}

fn extract_year_range(v: &serde_json::Value) -> Option<(i32, i32)> {
    let arr = v.as_array()?;
    if arr.len() < 2 {
        return None;
    }
    let a = json_to_i32(&arr[0])?;
    let b = json_to_i32(&arr[1])?;
    Some((a, b))
}

fn json_to_i32(v: &serde_json::Value) -> Option<i32> {
    if let Some(n) = v.as_i64() {
        return Some(n as i32);
    }
    if let Some(n) = v.as_u64() {
        return Some(n as i32);
    }
    if let Some(n) = v.as_f64() {
        return Some(n as i32);
    }
    None
}

fn truncate(s: &str, n: usize) -> String {
    if s.chars().count() <= n {
        return s.into();
    }
    let mut out: String = s.chars().take(n).collect();
    out.push('…');
    out
}
