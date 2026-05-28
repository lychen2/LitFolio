//! LLM profile/config IPC surface.
//!
//! Owns the four user-facing endpoints that touch only the LLM stack — config
//! load/save, the lightweight ping (`pong`) probe, and model enumeration.
//! Split out of `commands/mod.rs` to stop the god-file from growing.

use std::sync::Arc;
use tauri::State;

use crate::ai::{chat_complete, list_models, load_config, save_config, ChatMessage, LlmConfig, LlmProfile};

use super::AppState;

#[derive(serde::Serialize)]
pub struct LlmTestResult {
    pub ok: bool,
    pub model: String,
    pub reply: String,
}

#[tauri::command]
pub fn llm_get_config(state: State<'_, Arc<AppState>>) -> Result<LlmConfig, String> {
    load_config(&state.paths).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn llm_save_config(state: State<'_, Arc<AppState>>, config: LlmConfig) -> Result<(), String> {
    save_config(&state.paths, &config).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn llm_test(
    state: State<'_, Arc<AppState>>,
    profile: LlmProfile,
) -> Result<LlmTestResult, String> {
    let resp = chat_complete(
        &state.http,
        &profile,
        &[
            ChatMessage {
                role: "system".into(),
                content: "Reply with the single word: pong".into(),
            },
            ChatMessage {
                role: "user".into(),
                content: "ping".into(),
            },
        ],
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(LlmTestResult {
        ok: !resp.content.trim().is_empty(),
        model: resp.model,
        reply: resp.content,
    })
}

#[tauri::command]
pub async fn llm_list_models(
    state: State<'_, Arc<AppState>>,
    profile: LlmProfile,
) -> Result<Vec<String>, String> {
    list_models(&state.http, &profile)
        .await
        .map_err(|e| e.to_string())
}
