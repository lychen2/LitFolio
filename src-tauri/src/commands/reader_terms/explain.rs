//! LLM-based definition generation for extracted terms.
//!
//! Sends a batched prompt to the configured LLM and parses the response
//! into term→definition mappings. Falls back to a Chinese-language
//! boilerplate when the LLM returns nothing for a specific term.

use std::collections::HashMap;
use std::sync::Arc;

use anyhow::{anyhow, Result};
use tauri::State;

use super::candidates::CandidateTerm;
use super::evidence;
use crate::ai::{active_profile_for_task, chat_complete, load_config, ChatMessage, TaskKind};
use crate::commands::term_filter;
use crate::storage::Paper;
use crate::AppState;

pub(super) async fn explain_terms(
    state: &State<'_, Arc<AppState>>,
    paper: &Paper,
    terms: &[CandidateTerm],
    abbrev_long: &HashMap<String, String>,
) -> Result<HashMap<String, String>> {
    let cfg = load_config(&state.paths)?;
    let profile = active_profile_for_task(&cfg, TaskKind::Tag)?;
    let items = terms
        .iter()
        .map(|term| {
            let norm = term_filter::normalize_term(&term.term);
            match abbrev_long.get(&norm) {
                Some(long) => format!(
                    "- {} (full form: {}) | evidence: {}",
                    term.term, long, term.local_evidence
                ),
                None => format!("- {} | evidence: {}", term.term, term.local_evidence),
            }
        })
        .collect::<Vec<_>>()
        .join("\n");
    let user_content = crate::ai::prompts::EXPLAIN_TERMS_USER
        .replace("{title}", &paper.title)
        .replace("{items}", &items);
    let resp = chat_complete(
        &state.http,
        &profile,
        &[
            ChatMessage {
                role: "system".into(),
                content: crate::ai::prompts::EXPLAIN_TERMS_SYSTEM.into(),
            },
            ChatMessage {
                role: "user".into(),
                content: user_content,
            },
        ],
    )
    .await?;
    let value = crate::ai::json_utils::parse_lenient_value(&resp.content);
    let defs = definitions_array(&value).ok_or_else(|| {
        anyhow!(
            "missing definitions array in LLM response: {}",
            evidence::truncate(&resp.content, 500)
        )
    })?;
    let mut out = HashMap::new();
    for item in defs {
        let term = item
            .get("term")
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .trim();
        let definition = item
            .get("definition")
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .trim();
        if !term.is_empty() && !definition.is_empty() {
            out.insert(term.to_string(), definition.to_string());
        }
    }
    Ok(out)
}

fn definitions_array(value: &serde_json::Value) -> Option<&Vec<serde_json::Value>> {
    if let Some(items) = value.get("definitions").and_then(|items| items.as_array()) {
        return Some(items);
    }
    value.as_array()
}

pub(super) fn fallback_definition(term: &CandidateTerm) -> String {
    fallback_definition_for(&term.term)
}

pub(super) fn fallback_definition_for(term: &str) -> String {
    format!("本文将 {term} 放在当前论证或方法上下文中使用。")
}
