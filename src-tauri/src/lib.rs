//! LitFolio backend entry. Wires plugins, state, and command handlers.

mod ai;
mod bibtex;
mod cluster;
mod commands;
mod discovery;
mod export;
mod http;
mod index;
mod ingest;
mod library_sync;
mod secret;
mod startup;
mod storage;

use tauri::Manager;
use tokio::sync::Mutex as AsyncMutex;
use tokio_util::sync::CancellationToken;
use tracing_subscriber::EnvFilter;

use storage::{LibraryPaths, Pool};

pub struct AppState {
    pub pool: Pool,
    pub paths: LibraryPaths,
    pub http: reqwest::Client,
    /// Hardened client for URLs we got from third-party data (PDF downloads,
    /// RSS feeds). Redirects are capped at 3 hops, require http(s) scheme, and
    /// refuse to land on private/loopback/link-local addresses — the SSRF
    /// defense that stops a malicious server from pivoting us into the local
    /// network or AWS metadata.
    pub http_external: reqwest::Client,
    /// Holds the in-flight batch's cancel token (if any). `AsyncMutex` rather
    /// than `std::sync::Mutex` because the batch command handlers hold this
    /// guard around `.await` points (sqlx writes, HTTP calls). A blocking
    /// guard there would pin a tokio worker thread.
    pub batch_cancel: AsyncMutex<Option<CancellationToken>>,
    pub sync_lock: AsyncMutex<()>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    if let Err(e) = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::greet,
            commands::app_version,
            commands::library_root,
            commands::papers::papers_count,
            commands::papers::papers_recent,
            commands::papers::papers_in_folder,
            commands::papers::papers_search,
            commands::papers::papers_all_arxiv_ids,
            commands::papers::paper_get,
            commands::papers::paper_set_read_status,
            commands::papers::paper_delete,
            commands::papers::paper_enrich_from_doi,
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
            commands::imports::prepare_doi_draft,
            commands::imports::paper_find_by_doi,
            commands::imports::prepare_arxiv_draft,
            commands::pdf::local::paper_save_with_pdf,
            commands::pdf::local::paper_attach_pdf,
            commands::pdf::local::paper_open_pdf,
            commands::pdf::local::paper_pdf_asset_path,
            commands::llm::llm_get_config,
            commands::llm::llm_save_config,
            commands::llm::llm_test,
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
            commands::notes::note_get,
            commands::notes::note_save,
            commands::reader_translate::reader_translate_selection,
            commands::llm::llm_list_models,
            commands::search::search_expand_query,
            commands::survey::topic_survey,
            commands::survey::topic_survey_save_as_note,
            commands::ask::library_ask,
            commands::ask::ask_save_as_note,
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
            commands::export::bibtex_backfill,
            commands::export::export_markdown_dir,
            commands::export::export_markdown_set_dir,
            commands::export::export_markdown_all,
            commands::export::export_markdown_paper,
            commands::search::search_unified,
            commands::comparisons::paper_comparisons_list,
            commands::comparisons::paper_comparison_get,
            commands::comparisons::paper_comparison_create,
            commands::comparisons::paper_comparison_generate,
            commands::comparisons::paper_comparison_update,
            commands::comparisons::paper_comparison_delete,
            commands::notes::note_sections_get,
            commands::notes::note_sections_save,
            commands::notes::note_sections_reorder,
            commands::notes::note_section_delete,
            commands::discovery::paper_similar,
            commands::export::export_citations,
            commands::discovery::paper_citations,
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
            commands::pdf::folder::import_folder,
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
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match startup::bootstrap_state().await {
                    Ok(state) => {
                        handle.manage(state);
                        tracing::info!("LitFolio backend booted");
                    }
                    Err(e) => tracing::error!(error = %e, "bootstrap failed"),
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
    {
        tracing::error!(error = %e, "error while running litfolio");
        std::process::exit(1);
    }
}
