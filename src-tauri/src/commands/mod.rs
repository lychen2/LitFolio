//! IPC command surface exposed to the React frontend.

pub mod ask;
pub mod batch;
pub mod candidates;
pub mod comparisons;
pub mod concepts;
pub mod custom_fields;
pub mod discovery;
pub mod duplicates;
pub(crate) mod events;
pub mod evidence;
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
pub mod project_manifest;
pub mod project_writing;
pub mod project_writing_render;
pub mod projects;
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

#[allow(unused_macros)]
macro_rules! command_paths_core {
    ([$($commands:tt)*]) => {
        $crate::commands::command_paths_papers!([
            $($commands)*
            commands::greet,
            commands::app_version,
            commands::library_root,
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
            commands::sync::sync_get_config,
            commands::sync::sync_save_config,
            commands::sync::sync_test,
            commands::sync::sync_push_library,
            commands::sync::sync_pull_library,
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
            commands::candidates::candidates_list,
            commands::candidates::candidate_upsert,
            commands::candidates::candidate_set_status,
            commands::projects::projects_list,
            commands::projects::project_get,
            commands::projects::project_create,
            commands::projects::project_update,
            commands::projects::project_delete,
            commands::projects::project_papers_list,
            commands::projects::project_add_paper,
            commands::projects::project_remove_paper,
            commands::projects::project_weekly_review,
            commands::projects::project_export_markdown,
            commands::project_manifest::project_source_manifest,
            commands::project_writing::project_writing_outline,
            commands::evidence::evidence_list,
            commands::evidence::evidence_add,
            commands::evidence::evidence_add_from_highlight,
            commands::evidence::evidence_delete,
            commands::evidence::evidence_export_markdown,
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
            commands::highlights::highlight_update_label,
            commands::highlights::highlight_delete,
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
            commands::notes::note_get,
            commands::notes::note_save,
            commands::notes::note_sections_get,
            commands::notes::note_sections_save,
            commands::notes::note_sections_reorder,
            commands::notes::note_section_delete,
            commands::search::search_expand_query,
            commands::survey::topic_survey,
            commands::survey::topic_survey_save_as_note,
            commands::ask::library_ask,
            commands::ask::ask_save_as_note,
        ])
    };
}

#[allow(unused_macros)]
macro_rules! command_paths_feeds_discovery_graph {
    ([$($commands:tt)*]) => {
        $crate::commands::command_paths_collections_data!([
            $($commands)*
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
            commands::graph::graph_data,
            commands::graph::paper_link_create,
            commands::graph::paper_link_create_or_get,
            commands::graph::paper_link_delete,
            commands::graph::paper_links_for_paper,
            commands::graph::ai_discover_links,
            commands::graph::ai_accept_link,
            commands::graph::ai_reject_link,
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
            commands::export::export_citations,
            commands::search::search_unified,
            commands::comparisons::paper_comparisons_list,
            commands::comparisons::paper_comparison_get,
            commands::comparisons::paper_comparison_create,
            commands::comparisons::paper_comparison_generate,
            commands::comparisons::paper_comparison_update,
            commands::comparisons::paper_comparison_delete,
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
        tauri::generate_handler![
            $($commands)*
            commands::topic_alerts::topic_alerts_list,
            commands::topic_alerts::topic_alert_create,
            commands::topic_alerts::topic_alert_delete,
            commands::topic_alerts::topic_alert_results_list,
            commands::topic_alerts::topic_alert_result_mark_seen,
            commands::topic_alerts::topic_alert_mark_all_seen,
            commands::topic_alerts::topic_alert_unseen_count,
            commands::topic_alerts::topic_alert_run,
            commands::topic_alerts::topic_alert_run_all,
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
