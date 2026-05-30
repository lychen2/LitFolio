//! Literature review draft generation from a group of papers.

use anyhow::Result;
use serde::{Deserialize, Serialize};

use super::client::{chat_complete, ChatMessage};
use super::profile::LlmProfile;
use crate::storage::Paper;

/// How to group papers in the generated review.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum GroupingStrategy {
    Theme,
    Method,
    Year,
    ApplicationDomain,
}

impl GroupingStrategy {
    pub fn label(self) -> &'static str {
        match self {
            Self::Theme => "thematic grouping",
            Self::Method => "methodology grouping",
            Self::Year => "chronological grouping",
            Self::ApplicationDomain => "application domain grouping",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LitReviewResult {
    pub markdown: String,
    pub grouping: GroupingStrategy,
    pub paper_count: usize,
    pub model: String,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
}

const SYSTEM_PROMPT: &str = "\
You are an experienced academic researcher writing a literature review section \
for a thesis or survey paper. You will receive a list of papers with their \
metadata (title, authors, year, abstract, TL;DR, method, key findings, \
limitations, comparison notes).

Your task:
1. Organize the papers into coherent sections based on the requested grouping strategy.
2. Write an academic-style literature review in Markdown.

Structure:
- **Introduction** (1-2 paragraphs): scope of the review, criteria for paper selection.
- **2-4 Thematic/Methodological Sections**: each section summarizes 3-8 related papers, \
  cites them inline as [Author et al., Year], notes methodological trends and relationships.
- **Research Gaps** (1 paragraph): what remains unsolved across the surveyed papers.
- **Conclusion** (1 paragraph): synthesis of the field's trajectory.

Rules:
- Cite EVERY paper at least once using [Author et al., Year] format (use first author's \
  last name + \"et al.\" if >2 authors).
- Use formal academic prose, not bullet lists.
- Note methodological connections: \"Building on X's approach, Y proposed...\" / \
  \"In contrast to X, Y argued...\"
- Write 2000-5000 words depending on paper count (aim for ~200 words per paper).
- Output ONLY the Markdown review text, no meta-commentary.";

/// Generate a structured literature review from a set of papers.
pub async fn generate_review(
    client: &reqwest::Client,
    profile: &LlmProfile,
    papers: &[Paper],
    grouping: GroupingStrategy,
    output_language: &str,
) -> Result<LitReviewResult> {
    if papers.is_empty() {
        return Err(anyhow::anyhow!("no papers provided for review generation"));
    }

    let user_content = format_papers_prompt(papers, grouping, output_language);
    let resp = chat_complete(
        client,
        profile,
        &[
            ChatMessage {
                role: "system".into(),
                content: SYSTEM_PROMPT.into(),
            },
            ChatMessage {
                role: "user".into(),
                content: user_content,
            },
        ],
    )
    .await?;

    Ok(LitReviewResult {
        markdown: resp.content.trim().to_string(),
        grouping,
        paper_count: papers.len(),
        model: resp.model,
        prompt_tokens: resp.prompt_tokens,
        completion_tokens: resp.completion_tokens,
    })
}

fn format_papers_prompt(
    papers: &[Paper],
    grouping: GroupingStrategy,
    output_language: &str,
) -> String {
    let mut out = String::new();
    out.push_str(&format!(
        "Generate a literature review using {}.\n\
         Output language: {}.\n\n",
        grouping.label(),
        output_language,
    ));
    out.push_str(&format!("Papers ({} total):\n\n", papers.len()));

    for (i, p) in papers.iter().enumerate() {
        let authors_display = format_authors(&p.authors);
        out.push_str(&format!("--- Paper {} ---\n", i + 1));
        out.push_str(&format!("Title: {}\n", p.title));
        out.push_str(&format!("Authors: {}\n", authors_display));
        if let Some(y) = p.year {
            out.push_str(&format!("Year: {}\n", y));
        }
        if let Some(ref v) = p.venue {
            out.push_str(&format!("Venue: {}\n", v));
        }
        if let Some(ref abs) = p.abstract_text {
            out.push_str(&format!("Abstract: {}\n", abs));
        }
        if let Some(ref tldr) = p.tldr {
            out.push_str(&format!("TL;DR: {}\n", tldr));
        }
        if let Some(ref method) = p.method {
            out.push_str(&format!("Method: {}\n", method));
        }
        if !p.key_findings.is_empty() {
            out.push_str(&format!("Key Findings: {}\n", p.key_findings.join("; ")));
        }
        if let Some(ref cmp) = p.comparison {
            out.push_str(&format!("Comparison: {}\n", cmp));
        }
        if let Some(ref lim) = p.limitations {
            out.push_str(&format!("Limitations: {}\n", lim));
        }
        out.push('\n');
    }

    out
}

fn format_authors(authors: &[String]) -> String {
    if authors.is_empty() {
        return "Unknown".into();
    }
    if authors.len() <= 3 {
        return authors.join(", ");
    }
    format!("{}, et al.", authors[0])
}
