//! IPC command surface exposed to the React frontend.

pub mod ask;
pub mod batch;
pub mod comparisons;
pub mod concepts;
pub mod custom_fields;
pub mod discovery;
pub mod duplicates;
pub(crate) mod events;
pub mod export;
pub mod feed_metadata;
pub mod feeds;
pub mod folders;
pub mod graph;
pub mod highlights;
pub mod imports;
pub mod lit_review;
pub mod llm;
pub mod notes;
pub mod papers;
pub mod pdf;
pub mod queue;
pub mod reader_terms;
pub mod reader_translate;
pub mod search;
pub mod smart_collections;
pub mod summaries;
pub mod survey;
pub mod sync;
pub mod tags;
pub mod term_filter;
pub mod topic_alerts;

use std::sync::Arc;

use tauri::State;

use crate::AppState;

#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {name}, welcome to LitFolio.")
}

#[tauri::command]
pub fn app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[tauri::command]
pub fn library_root(state: State<'_, Arc<AppState>>) -> String {
    state.paths.root.display().to_string()
}
