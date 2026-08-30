//! IPC command surface exposed to the React frontend.

pub(crate) mod ai_dispatch;
#[cfg(feature = "plugin-library-ask")]
pub mod ask;
pub mod batch;
#[cfg(feature = "plugin-candidate-inbox")]
pub mod candidates;
#[cfg(feature = "plugin-knowledge-graph")]
pub mod concepts;
pub mod custom_fields;
pub mod discovery;
pub mod duplicates;
pub(crate) mod events;
pub mod export;
#[cfg(feature = "plugin-discovery-feeds")]
pub mod feed_metadata;
#[cfg(feature = "plugin-discovery-feeds")]
pub mod feeds;
pub mod folders;
#[cfg(feature = "plugin-knowledge-graph")]
pub mod graph;
pub mod highlights;
pub mod imports;
pub mod jobs;
pub mod legacy_reader_notes;
pub mod lit_review;
pub mod llm;
pub mod notes;
pub mod papers;
pub mod pdf;
pub mod pdf_notes;
pub mod plugin_host;
pub mod provenance;
pub mod queue;
pub mod reader_ask;
pub mod reader_terms;
pub mod reader_translate;
pub mod search;
pub mod smart_collections;
pub mod summaries;
pub mod supplements;
#[cfg(feature = "plugin-discovery-feeds")]
pub mod survey;
pub mod sync;
pub mod tags;
pub mod term_filter;
pub mod topic_alerts;
pub mod zotero;

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

#[tauri::command]
pub fn diagnostics_export_log(
    state: State<'_, Arc<AppState>>,
    dest_path: String,
) -> Result<String, String> {
    export_diagnostics_log(&state.paths, std::path::Path::new(&dest_path))
        .map(|path| path.display().to_string())
        .map_err(|e| e.to_string())
}

fn export_diagnostics_log(
    paths: &crate::storage::LibraryPaths,
    dest_path: &std::path::Path,
) -> anyhow::Result<std::path::PathBuf> {
    if dest_path.as_os_str().is_empty() {
        anyhow::bail!("destination path is required");
    }
    let source = paths.app_log_file();
    let dest = if dest_path.is_absolute() {
        dest_path.to_path_buf()
    } else {
        std::env::current_dir()?.join(dest_path)
    };
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    if source.exists() {
        let canon_source = std::fs::canonicalize(&source)?;
        if dest.exists() && std::fs::canonicalize(&dest)? == canon_source {
            return Ok(dest);
        }
        std::fs::copy(&source, &dest)?;
    } else {
        std::fs::write(&dest, "LitFolio diagnostic log has not been created yet.\n")?;
    }
    Ok(dest)
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct StorageStats {
    pub papers_bytes: u64,
    pub notes_bytes: u64,
    pub attachments_bytes: u64,
    pub vectors_bytes: u64,
    pub database_bytes: u64,
}

#[tauri::command]
pub async fn storage_stats(state: State<'_, Arc<AppState>>) -> Result<StorageStats, String> {
    let paths = &state.paths;
    let papers_bytes = dir_size(&paths.papers_dir())
        .map_err(|e| format!("Failed to scan papers directory: {}", e))?;
    let notes_bytes = dir_size(&paths.notes_dir())
        .map_err(|e| format!("Failed to scan notes directory: {}", e))?;
    let attachments_bytes = dir_size(&paths.attachments_dir())
        .map_err(|e| format!("Failed to scan attachments directory: {}", e))?;
    let vectors_bytes = dir_size(&paths.vectors_dir())
        .map_err(|e| format!("Failed to scan vectors directory: {}", e))?;

    // Include the main database file plus WAL and SHM sidecars
    let db_path = paths.db_file();
    let mut database_bytes = std::fs::metadata(&db_path).map(|m| m.len()).unwrap_or(0);

    // Add WAL sidecar if present
    if let Some(wal_path) = db_path.to_str().map(|s| format!("{}-wal", s)) {
        if let Ok(meta) = std::fs::metadata(&wal_path) {
            database_bytes += meta.len();
        }
    }
    // Add SHM sidecar if present
    if let Some(shm_path) = db_path.to_str().map(|s| format!("{}-shm", s)) {
        if let Ok(meta) = std::fs::metadata(&shm_path) {
            database_bytes += meta.len();
        }
    }

    Ok(StorageStats {
        papers_bytes,
        notes_bytes,
        attachments_bytes,
        vectors_bytes,
        database_bytes,
    })
}

fn dir_size(path: &std::path::Path) -> Result<u64, std::io::Error> {
    let mut total: u64 = 0;
    let entries = std::fs::read_dir(path)?;
    for entry in entries {
        let entry = entry?;
        // Use symlink_metadata to avoid following symlinks
        let meta = entry.metadata()?;
        let file_type = meta.file_type();

        if file_type.is_symlink() {
            // Skip symlinks entirely to avoid cycles and escaping library root
            continue;
        } else if file_type.is_file() {
            total += meta.len();
        } else if file_type.is_dir() {
            total += dir_size(&entry.path())?;
        }
    }
    Ok(total)
}

#[cfg(test)]
mod diagnostics_export_tests {
    use super::*;
    use crate::storage::LibraryPaths;

    #[test]
    fn diagnostics_export_log_copies_existing_log() {
        let root = std::env::temp_dir().join(format!("litera-diag-export-{}", ulid::Ulid::new()));
        let paths = LibraryPaths::new(&root);
        paths.ensure().unwrap();
        std::fs::write(paths.app_log_file(), "diagnostic line\n").unwrap();

        let dest = root.join("exports").join("litfolio-diagnostics.log");
        let exported = export_diagnostics_log(&paths, &dest).unwrap();

        assert_eq!(exported, dest);
        assert_eq!(
            std::fs::read_to_string(&exported).unwrap(),
            "diagnostic line\n"
        );
        std::fs::remove_dir_all(root).ok();
    }

    #[test]
    fn diagnostics_export_log_writes_placeholder_when_missing() {
        let root = std::env::temp_dir().join(format!("litera-diag-empty-{}", ulid::Ulid::new()));
        let paths = LibraryPaths::new(&root);
        paths.ensure().unwrap();

        let dest = root.join("exports").join("litfolio-diagnostics.log");
        let exported = export_diagnostics_log(&paths, &dest).unwrap();

        assert_eq!(exported, dest);
        assert_eq!(
            std::fs::read_to_string(&exported).unwrap(),
            "LitFolio diagnostic log has not been created yet.\n"
        );
        std::fs::remove_dir_all(root).ok();
    }
}

#[allow(unused_macros)]
macro_rules! command_paths_core {
    ([$($commands:tt)*]) => {
        $crate::commands::command_paths_papers!([
            $($commands)*
            commands::greet,
            commands::app_version,
            commands::library_root,
            commands::storage_stats,
        ])
    };
}

#[allow(unused_macros)]
macro_rules! command_paths_papers {
    ([$($commands:tt)*]) => {
        $crate::commands::command_paths_library_taxonomy!([
            $($commands)*
            commands::papers::papers_count,
            commands::papers::papers_recent,
            commands::papers::papers_in_folder,
            commands::papers::papers_search,
            commands::papers::papers_all_arxiv_ids,
            commands::papers::paper_get,
            commands::papers::paper_set_read_status,
            commands::papers::paper_delete,
            commands::papers::paper_enrich_from_doi,
        ])
    };
}

#[allow(unused_macros)]
macro_rules! command_paths_library_taxonomy {
    ([$($commands:tt)*]) => {
        $crate::commands::command_paths_imports_pdf!([
            $($commands)*
            commands::tags::tags_list,
            commands::tags::tag_create,
            commands::tags::tag_rename,
            commands::tags::tag_set_color,
            commands::tags::tag_delete,
            commands::tags::paper_attach_tag,
            commands::tags::paper_detach_tag,
            commands::tags::paper_tags,
            commands::tags::papers_batch_tags,
            commands::folders::folders_list,
            commands::folders::folder_create,
            commands::folders::folder_rename,
            commands::folders::folder_delete,
            commands::folders::paper_attach_folder,
            commands::folders::paper_detach_folder,
            commands::folders::paper_folders,
        ])
    };
}

#[allow(unused_macros)]
macro_rules! command_paths_imports_pdf {
    ([$($commands:tt)*]) => {
        $crate::commands::command_paths_config_sync_ai!([
            $($commands)*
            commands::imports::import_doi,
            commands::imports::import_arxiv,
            commands::imports::import_bibtex,
            commands::pdf::import_files::import_pdf_files,
            commands::imports::search_papers,
            commands::imports::add_from_search,
            commands::imports::add_many_from_search,
            commands::imports::topic_discover,
            commands::imports::arxiv_list_category,
            commands::imports::arxiv_add_draft,
            commands::pdf::download::arxiv_add_with_pdf,
            commands::pdf::download::doi_add_with_pdf,
            commands::imports::prepare_doi_draft,
            commands::imports::paper_find_by_doi,
            commands::imports::prepare_arxiv_draft,
            commands::pdf::local::paper_save_with_pdf,
            commands::pdf::local::paper_attach_pdf,
            commands::pdf::local::paper_open_pdf,
            commands::pdf::local::paper_pdf_asset_path,
            commands::pdf::folder::import_folder,
            commands::jobs::jobs_list,
            commands::jobs::job_create,
            commands::jobs::job_start,
            commands::jobs::job_update_progress,
            commands::jobs::job_succeed,
            commands::jobs::job_fail,
            commands::jobs::job_cancel,
            commands::jobs::job_retry,
        ])
    };
}

#[allow(unused_macros)]
macro_rules! command_paths_config_sync_ai {
    ([$($commands:tt)*]) => {
        $crate::commands::command_paths_projects_research!([
            $($commands)*
            commands::llm::llm_get_config,
            commands::llm::llm_save_config,
            commands::llm::llm_test,
            commands::llm::llm_list_models,
            commands::llm::llm_pull_model,
            commands::llm::ai_cancel_execution,
            commands::llm::ai_list_running_executions,
            commands::plugin_host::plugin_host_list,
            commands::plugin_host::plugin_host_enable,
            commands::plugin_host::plugin_host_disable,
            commands::sync::sync_get_config,
            commands::sync::sync_save_config,
            commands::sync::sync_test,
            commands::sync::sync_preview_push_library,
            commands::sync::sync_preview_pull_library,
            commands::sync::sync_push_library,
            commands::sync::sync_pull_library,
            commands::zotero::zotero_get_config,
            commands::zotero::zotero_save_config,
            commands::zotero::zotero_test,
            commands::zotero::zotero_list_targets,
            commands::zotero::zotero_push,
            commands::summaries::paper_tldr,
            commands::summaries::paper_quick_read,
            commands::summaries::paper_translate,
            commands::summaries::draft_translate,
            commands::batch::batch_attach_tag,
            commands::batch::batch_set_status,
            commands::batch::batch_delete,
            commands::batch::ai::batch_tldr,
            commands::batch::ai::batch_quick_read,
            commands::batch::ai::batch_translate,
            commands::batch::batch_cancel,
        ])
    };
}

#[allow(unused_macros)]
macro_rules! command_paths_projects_research {
    ([$($commands:tt)*]) => {
        $crate::commands::command_paths_reader_notes!([
            $($commands)*
        ])
    };
}

#[allow(unused_macros)]
macro_rules! command_paths_reader_notes {
    ([$($commands:tt)*]) => {
        $crate::commands::command_paths_feeds_discovery_graph!([
            $($commands)*
            commands::highlights::highlight_create,
            commands::highlights::highlight_list,
            commands::highlights::highlight_update_note,
            commands::highlights::highlight_update_rect,
            commands::highlights::highlight_update_label,
            commands::highlights::highlight_delete,
            commands::pdf_notes::pdf_note_create,
            commands::pdf_notes::pdf_note_list,
            commands::pdf_notes::pdf_note_update,
            commands::pdf_notes::pdf_note_delete,
            commands::pdf_notes::pdf_note_search,
            commands::legacy_reader_notes::legacy_reader_notes_preview,
            commands::legacy_reader_notes::legacy_reader_notes_export,
            commands::reader_terms::paper_terms_list,
            commands::reader_terms::paper_terms_generate,
            commands::reader_terms::paper_terms_generate_candidates,
            commands::reader_terms::paper_terms_explain,
            commands::reader_terms::paper_term_add,
            commands::reader_terms::paper_term_delete,
            commands::reader_terms::paper_set_pdf_text,
            commands::reader_translate::highlight_summarize,
            commands::reader_translate::highlight_translate,
            commands::reader_translate::highlight_explain,
            commands::reader_translate::reader_translate_selection,
            commands::reader_ask::reader_ask_paper,
            commands::reader_translate::paper_translated_markdown_get,
            commands::reader_translate::paper_translate_markdown,
            commands::reader_translate::paper_translate_markdown_estimate,
            commands::notes::note_get,
            commands::notes::note_save,
            commands::provenance::document_candidate_stage,
            commands::provenance::document_accept,
            commands::provenance::document_revisions_list,
            commands::provenance::source_segment_list,
            commands::provenance::source_link_create,
            commands::provenance::source_link_resolve,
            commands::provenance::source_link_list_for_anchor,
            commands::provenance::backlinks_list,
            commands::provenance::note_revisions_list,
            commands::provenance::provenance_backfill,
            commands::provenance::provenance_remap,
            commands::provenance::provenance_export,
            commands::provenance::note_save_provenance,
            commands::notes::note_sections_get,
            commands::notes::note_sections_save,
            commands::notes::note_sections_reorder,
            commands::notes::note_section_delete,
            commands::supplements::paper_supplements_list,
            commands::supplements::paper_supplement_add_file,
            commands::supplements::paper_supplement_update_note,
            commands::supplements::paper_supplement_delete,
            commands::supplements::paper_supplement_open,
            commands::supplements::paper_supplement_convert_docx_to_pdf,
            commands::search::search_expand_query,
        ])
    };
}

#[allow(unused_macros)]
macro_rules! command_paths_feeds_discovery_graph {
    ([$($commands:tt)*]) => {
        $crate::commands::command_paths_collections_data!([
            $($commands)*
            commands::discovery::paper_similar,
            commands::discovery::paper_citations,
        ])
    };
}

#[allow(unused_macros)]
macro_rules! command_paths_collections_data {
    ([$($commands:tt)*]) => {
        $crate::commands::command_paths_alerts_concepts!([
            $($commands)*
            commands::export::bibtex_backfill,
            commands::export::export_markdown_dir,
            commands::export::export_markdown_set_dir,
            commands::export::export_markdown_all,
            commands::export::export_markdown_paper,
            commands::export::obsidian_export_all,
            commands::export::export_citations,
            commands::diagnostics_export_log,
            commands::search::search_unified,
            commands::queue::queue_list,
            commands::queue::queue_add,
            commands::queue::queue_remove,
            commands::queue::queue_update,
            commands::queue::queue_reorder,
            commands::lit_review::generate_lit_review,
            commands::smart_collections::smart_collections_list,
            commands::smart_collections::smart_collection_create,
            commands::smart_collections::smart_collection_update,
            commands::smart_collections::smart_collection_delete,
            commands::smart_collections::smart_collection_query_papers,
            commands::duplicates::paper_find_duplicate,
            commands::duplicates::paper_scan_duplicates,
            commands::duplicates::paper_merge,
            commands::custom_fields::custom_field_defs_list,
            commands::custom_fields::custom_field_def_create,
            commands::custom_fields::custom_field_def_delete,
            commands::custom_fields::paper_custom_fields_get,
            commands::custom_fields::paper_custom_field_set,
            commands::custom_fields::paper_custom_field_delete,
        ])
    };
}

#[allow(unused_macros)]
macro_rules! command_paths_alerts_concepts {
    ([$($commands:tt)*]) => {
        $crate::commands::stage_ask!([$($commands)*
            commands::topic_alerts::topic_alerts_list,
            commands::topic_alerts::topic_alert_create,
            commands::topic_alerts::topic_alert_delete,
            commands::topic_alerts::topic_alert_results_list,
            commands::topic_alerts::topic_alert_result_mark_seen,
            commands::topic_alerts::topic_alert_mark_all_seen,
            commands::topic_alerts::topic_alert_unseen_count,
            commands::topic_alerts::topic_alert_run,
            commands::topic_alerts::topic_alert_run_all,
        ])
    };
}

// Plugin-owned command stages. Each stage appends its entries only when the
// matching cargo feature is on, then chains to the next stage; the off variant
// is a pure passthrough so core builds physically omit the commands.
#[cfg(feature = "plugin-library-ask")]
macro_rules! stage_ask {
    ([$($c:tt)*]) => {
        $crate::commands::stage_feeds!([$($c)*
            commands::ask::ask_session_latest,
            commands::ask::ask_session_save,
            commands::ask::ask_capability_state,
            commands::ask::library_ask,
            commands::ask::ask_save_as_note,
        ])
    };
}
#[cfg(not(feature = "plugin-library-ask"))]
macro_rules! stage_ask {
    ([$($c:tt)*]) => {
        $crate::commands::stage_feeds!([$($c)*])
    };
}

#[cfg(feature = "plugin-discovery-feeds")]
macro_rules! stage_feeds {
    ([$($c:tt)*]) => {
        $crate::commands::stage_candidates!([$($c)*
            commands::feeds::feeds_list,
            commands::feeds::feed_add,
            commands::feeds::feed_remove,
            commands::feeds::feed_refresh,
            commands::feeds::feed_refresh_all,
            commands::feeds::feed_items_list,
            commands::feeds::feed_item_set_seen,
            commands::feeds::feed_mark_all_seen,
            commands::feeds::feed_item_link_paper,
            commands::feed_metadata::feed_item_prepare_draft,
            commands::survey::topic_survey,
            commands::survey::topic_survey_save_as_note,
        ])
    };
}
#[cfg(not(feature = "plugin-discovery-feeds"))]
macro_rules! stage_feeds {
    ([$($c:tt)*]) => {
        $crate::commands::stage_candidates!([$($c)*])
    };
}

#[cfg(feature = "plugin-candidate-inbox")]
macro_rules! stage_candidates {
    ([$($c:tt)*]) => {
        $crate::commands::stage_graph!([$($c)*
            commands::candidates::candidates_list,
            commands::candidates::candidate_upsert,
            commands::candidates::candidate_set_status,
        ])
    };
}
#[cfg(not(feature = "plugin-candidate-inbox"))]
macro_rules! stage_candidates {
    ([$($c:tt)*]) => {
        $crate::commands::stage_graph!([$($c)*])
    };
}

#[cfg(feature = "plugin-knowledge-graph")]
macro_rules! stage_graph {
    ([$($c:tt)*]) => {
        tauri::generate_handler![$($c)*
            commands::graph::graph_data,
            commands::graph::paper_link_create,
            commands::graph::paper_link_create_or_get,
            commands::graph::paper_link_delete,
            commands::graph::paper_links_for_paper,
            commands::graph::ai_discover_links,
            commands::graph::ai_accept_link,
            commands::graph::ai_reject_link,
            commands::concepts::concepts_list,
            commands::concepts::concept_create,
            commands::concepts::concept_delete,
            commands::concepts::concept_relations_list,
            commands::concepts::concept_relation_create,
            commands::concepts::concept_relation_delete,
            commands::concepts::concept_link_paper,
            commands::concepts::concept_unlink_paper,
            commands::concepts::concept_for_paper,
            commands::concepts::concept_extract_from_paper,
            commands::concepts::concept_extract_and_store,
        ]
    };
}
#[cfg(not(feature = "plugin-knowledge-graph"))]
macro_rules! stage_graph {
    ([$($c:tt)*]) => {
        tauri::generate_handler![$($c)*]
    };
}

#[allow(unused_macros)]
macro_rules! command_handlers {
    () => {
        $crate::commands::command_paths_core!([])
    };
}

#[allow(unused_imports)]
pub(crate) use command_handlers;
#[allow(unused_imports)]
pub(crate) use command_paths_alerts_concepts;
#[allow(unused_imports)]
pub(crate) use command_paths_collections_data;
#[allow(unused_imports)]
pub(crate) use command_paths_config_sync_ai;
#[allow(unused_imports)]
pub(crate) use command_paths_core;
#[allow(unused_imports)]
pub(crate) use command_paths_feeds_discovery_graph;
#[allow(unused_imports)]
pub(crate) use command_paths_imports_pdf;
#[allow(unused_imports)]
pub(crate) use command_paths_library_taxonomy;
#[allow(unused_imports)]
pub(crate) use command_paths_papers;
#[allow(unused_imports)]
pub(crate) use command_paths_projects_research;
#[allow(unused_imports)]
pub(crate) use command_paths_reader_notes;
#[allow(unused_imports)]
pub(crate) use stage_ask;
#[allow(unused_imports)]
pub(crate) use stage_candidates;
#[allow(unused_imports)]
pub(crate) use stage_feeds;
#[allow(unused_imports)]
pub(crate) use stage_graph;
