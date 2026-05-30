//! Search IPC commands.

use std::sync::Arc;

use tauri::State;

use crate::ai::{active_profile, expand_search_query, load_config, ExpandedQuery};
use crate::storage::{unified_search, UnifiedSearchResult};
use crate::AppState;

#[tauri::command]
pub async fn search_unified(
    state: State<'_, Arc<AppState>>,
    query: String,
    limit: Option<i64>,
) -> Result<Vec<UnifiedSearchResult>, String> {
    unified_search(&state.pool, &query, limit.unwrap_or(50))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_expand_query(
    state: State<'_, Arc<AppState>>,
    raw: String,
) -> Result<ExpandedQuery, String> {
    let cfg = load_config(&state.paths).map_err(|e| e.to_string())?;
    let prof = active_profile(&cfg).map_err(|e| e.to_string())?.clone();
    expand_search_query(&state.http, &prof, &raw)
        .await
        .map_err(|e| e.to_string())
}
