//! Extract methodological concepts and their relationships from paper text.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

use super::client::{chat_complete, ChatMessage};
use super::profile::{active_profile_for_task, load_config};
use super::TaskKind;
use crate::storage::LibraryPaths;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedConcept {
    pub name: String,
    pub description: String,
    pub relations: Vec<ExtractedRelation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedRelation {
    pub target: String,
    pub relation: String,
    pub snippet: Option<String>,
}

/// Extract methodological concepts from a paper's text.
pub async fn extract_concepts(
    http: &reqwest::Client,
    paths: &LibraryPaths,
    paper_title: &str,
    paper_text: &str,
) -> Result<Vec<ExtractedConcept>> {
    let cfg = load_config(paths).context("load LLM config")?;
    let profile = active_profile_for_task(&cfg, TaskKind::Tldr).context("no LLM profile")?;

    let text_preview: String = paper_text.chars().take(8000).collect();

    let system = r#"You are an expert research methodologist. Extract methodological concepts from the paper text.

Return a JSON array of objects. Each object has:
- "name": concept name (2-4 words, lowercase with underscores)
- "description": one-sentence explanation
- "relations": array of { "target": other concept name, "relation": one of [replaces, extends, requires, enables, competes_with], "snippet": brief supporting quote or null }

Focus on:
- Statistical methods, experimental designs, algorithms, theoretical frameworks
- NOT generic terms like "machine learning" or "neurIPS"
- Prefer specific, reusable concepts over vague categories

Return ONLY the JSON array, no markdown fences."#;

    let user = format!("Paper: {}\n\nText:\n{}", paper_title, text_preview);

    let messages = vec![
        ChatMessage {
            role: "system".into(),
            content: system.into(),
        },
        ChatMessage {
            role: "user".into(),
            content: user,
        },
    ];

    let resp = chat_complete(http, &profile, &messages)
        .await
        .context("concept extraction LLM call")?;

    let text = resp.content.trim();

    // Try to parse JSON array
    let concepts: Vec<ExtractedConcept> = serde_json::from_str(text)
        .or_else(|_| {
            // Try extracting JSON from markdown fences
            let start = text.find('[').unwrap_or(0);
            let end = text.rfind(']').unwrap_or(text.len());
            serde_json::from_str(&text[start..=end])
        })
        .unwrap_or_default();

    Ok(concepts)
}
