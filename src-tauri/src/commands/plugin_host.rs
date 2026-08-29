//! Plugin host IPC commands.
//!
//! The frontend can inspect the registry and toggle plugins; every privileged
//! operation a plugin performs still flows through the host reference monitor
//! (`plugin_host::authorize`) — the UI never grants authority.

use std::sync::Arc;

use serde::Serialize;
use tauri::State;

use crate::mono_contracts::manifest::PluginManifestV1;
use crate::plugin_host::{self, InstanceBinding};
use crate::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginHostEntry {
    pub manifest: PluginManifestV1,
    pub enabled: bool,
    pub generation: u64,
}

#[tauri::command]
pub async fn plugin_host_list(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<PluginHostEntry>, String> {
    plugin_host::list_plugins(&state)
        .await
        .map(|rows| {
            rows.into_iter()
                .map(|(manifest, enabled, generation)| PluginHostEntry {
                    manifest,
                    enabled,
                    generation,
                })
                .collect()
        })
        .map_err(|e| e.code())
}

/// Enable a plugin. Returns the fresh opaque binding for this activation.
#[tauri::command]
pub async fn plugin_host_enable(
    state: State<'_, Arc<AppState>>,
    plugin_id: String,
) -> Result<InstanceBinding, String> {
    plugin_host::enable_plugin(&state, &plugin_id)
        .await
        .map_err(|e| e.code())
}

#[tauri::command]
pub async fn plugin_host_disable(
    state: State<'_, Arc<AppState>>,
    plugin_id: String,
) -> Result<(), String> {
    plugin_host::disable_plugin(&state, &plugin_id)
        .await
        .map_err(|e| e.code())
}
