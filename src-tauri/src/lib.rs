//! LitFolio backend entry. Wires plugins, state, and command handlers.

mod ai;
mod bibtex;
mod cluster;
mod discovery;
mod export;
mod commands;
mod index;
mod ingest;
mod library_sync;
mod storage;

use anyhow::Result;
use std::sync::{Arc, Mutex as StdMutex};
use tauri::Manager;
use tokio::sync::Mutex as AsyncMutex;
use tokio_util::sync::CancellationToken;
use tracing_subscriber::EnvFilter;

use storage::{default_library_root, open_pool, run_migrations, LibraryPaths, Pool};

pub struct AppState {
    pub pool: Pool,
    pub paths: LibraryPaths,
    pub http: reqwest::Client,
    pub batch_cancel: StdMutex<Option<CancellationToken>>,
    pub sync_lock: AsyncMutex<()>,
}

async fn bootstrap_state() -> Result<Arc<AppState>> {
    let root = default_library_root()?;
    let paths = LibraryPaths::new(root);
    paths.ensure()?;
    let pool = open_pool(&paths.db_file()).await?;
    run_migrations(&pool).await?;
    let feed_repo = storage::FeedRepo::new(&pool);
    let repaired = feed_repo.repair_default_feed_urls().await.unwrap_or(0);
    if repaired > 0 {
        tracing::info!(repaired, "repaired legacy default RSS feed urls");
    }
    let seeded = feed_repo.seed_defaults_if_empty().await.unwrap_or(0);
    if seeded > 0 {
        tracing::info!(seeded, "seeded default RSS feeds");
    }
    // Seed default manual PDFs if the library is empty.
    let paper_repo = storage::PaperRepo::new(&pool);
    let paper_count = paper_repo.list_recent(1).await.unwrap_or_default().len();
    if paper_count == 0 {
        if let Ok(exe) = std::env::current_exe() {
            let exe_dir = exe.parent().unwrap_or(std::path::Path::new("."));
            // macOS: Contents/MacOS/exe -> Contents/Resources
            // Windows/Linux: same directory as exe
            let res_dir = if cfg!(target_os = "macos") {
                exe_dir.join("../Resources")
            } else {
                exe_dir.to_path_buf()
            };
            let manuals = [
                ("manual.pdf", "LitFolio 用户手册 (中文版)", "LitFolio"),
                ("manual-en.pdf", "LitFolio User Manual (English)", "LitFolio"),
            ];
            for (filename, title, venue) in &manuals {
                let src = res_dir.join(filename);
                if src.exists() {
                    let paper_id = ulid::Ulid::new().to_string();
                    let _ = ingest::import_pdf_file(&src, &paper_id, &paths);
                    let _ = paper_repo.update_title_venue(&paper_id, title, Some(venue)).await;
                    let _ = paper_repo.set_read_status(&paper_id, storage::ReadStatus::Read).await;
                    if let Ok(Some(p)) = paper_repo.get(&paper_id).await {
                        let _ = paper_repo.update_bibtex(&p.id, &bibtex::generate_bibtex(&p)).await;
                    }
                    tracing::info!(filename, "seeded default manual");
                }
            }
        }
    }
    // Backfill BibTeX for papers that predate the bibtex column.
    let need_bib = paper_repo.list_needing_bibtex().await.unwrap_or_default();
    if !need_bib.is_empty() {
        let n = need_bib.len();
        for p in &need_bib {
            let bib = bibtex::generate_bibtex(p);
            let _ = paper_repo.update_bibtex(&p.id, &bib).await;
        }
        tracing::info!(count = n, "backfilled BibTeX entries");
    }
    let http = reqwest::Client::builder()
        .user_agent("LitFolio/0.1")
        .connect_timeout(std::time::Duration::from_secs(15))
        .timeout(std::time::Duration::from_secs(120))
        .build()?;
    tracing::info!(root = %paths.root.display(), "library ready");
    Ok(Arc::new(AppState {
        pool,
        paths,
        http,
        batch_cancel: StdMutex::new(None),
        sync_lock: AsyncMutex::new(()),
    }))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            commands::greet,
            commands::app_version,
            commands::library_root,
            commands::papers_count,
            commands::papers_recent,
            commands::papers_in_folder,
            commands::papers_search,
            commands::papers_all_arxiv_ids,
            commands::paper_get,
            commands::paper_set_read_status,
            commands::paper_delete,
            commands::tags_list,
            commands::tag_create,
            commands::tag_rename,
            commands::tag_set_color,
            commands::tag_delete,
            commands::paper_attach_tag,
            commands::paper_detach_tag,
            commands::paper_tags,
            commands::folders_list,
            commands::folder_create,
            commands::folder_rename,
            commands::folder_delete,
            commands::paper_attach_folder,
            commands::paper_detach_folder,
            commands::paper_folders,
            commands::import_doi,
            commands::import_arxiv,
            commands::import_bibtex,
            commands::import_pdf_files,
            commands::search_papers,
            commands::add_from_search,
            commands::add_many_from_search,
            commands::topic_discover,
            commands::arxiv_list_category,
            commands::arxiv_add_draft,
            commands::arxiv_add_with_pdf,
            commands::prepare_doi_draft,
            commands::prepare_arxiv_draft,
            commands::paper_save_with_pdf,
            commands::paper_attach_pdf,
            commands::paper_open_pdf,
            commands::paper_read_pdf_bytes,
            commands::llm_get_config,
            commands::llm_save_config,
            commands::llm_test,
            commands::sync::sync_get_config,
            commands::sync::sync_save_config,
            commands::sync::sync_test,
            commands::sync::sync_push_library,
            commands::sync::sync_pull_library,
            commands::paper_tldr,
            commands::paper_quick_read,
            commands::paper_translate,
            commands::draft_translate,
            commands::batch_attach_tag,
            commands::batch_set_status,
            commands::batch_delete,
            commands::batch_tldr,
            commands::batch_quick_read,
            commands::batch_translate,
            commands::batch_cancel,
            commands::highlight_create,
            commands::highlight_list,
            commands::highlight_update_note,
            commands::highlight_update_label,
            commands::highlight_delete,
            commands::reader_terms::paper_terms_list,
            commands::reader_terms::paper_terms_generate,
            commands::reader_terms::paper_term_add,
            commands::reader_terms::paper_term_delete,
            commands::reader_terms::paper_set_pdf_text,
            commands::reader_translate::highlight_summarize,
            commands::reader_translate::highlight_translate,
            commands::note_get,
            commands::note_save,
            commands::reader_translate::reader_translate_selection,
            commands::llm_list_models,
            commands::search_expand_query,
            commands::survey::topic_survey,
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
            commands::graph::graph_data,
            commands::graph::paper_link_create,
            commands::graph::paper_link_delete,
            commands::graph::paper_links_for_paper,
            commands::graph::ai_discover_links,
            commands::graph::ai_accept_link,
            commands::graph::ai_reject_link,
            commands::bibtex_backfill,
            commands::export_markdown_dir,
            commands::export_markdown_set_dir,
            commands::export_markdown_all,
            commands::export_markdown_paper,
            commands::search_unified,
            commands::paper_comparisons_list,
            commands::paper_comparison_get,
            commands::paper_comparison_create,
            commands::paper_comparison_update,
            commands::paper_comparison_delete,
            commands::note_sections_get,
            commands::note_sections_save,
            commands::note_sections_reorder,
            commands::note_section_delete,
            commands::paper_similar,
            commands::export_citations,
            commands::paper_citations,
            commands::queue_list,
            commands::queue_add,
            commands::queue_remove,
            commands::queue_update,
            commands::queue_reorder,
            commands::generate_lit_review,
            commands::smart_collections_list,
            commands::smart_collection_create,
            commands::smart_collection_update,
            commands::smart_collection_delete,
            commands::smart_collection_query_papers,
            commands::paper_find_duplicate,
            commands::paper_scan_duplicates,
            commands::paper_merge,
            commands::custom_field_defs_list,
            commands::custom_field_def_create,
            commands::custom_field_def_delete,
            commands::paper_custom_fields_get,
            commands::paper_custom_field_set,
            commands::paper_custom_field_delete,
            commands::import_folder,
            commands::topic_alerts_list,
            commands::topic_alert_create,
            commands::topic_alert_delete,
            commands::topic_alert_results_list,
            commands::topic_alert_result_mark_seen,
            commands::topic_alert_mark_all_seen,
            commands::topic_alert_unseen_count,
            commands::topic_alert_run,
            commands::topic_alert_run_all,
            commands::concepts_list,
            commands::concept_create,
            commands::concept_delete,
            commands::concept_relations_list,
            commands::concept_relation_create,
            commands::concept_relation_delete,
            commands::concept_link_paper,
            commands::concept_unlink_paper,
            commands::concept_for_paper,
            commands::concept_extract_from_paper,
            commands::concept_extract_and_store,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match bootstrap_state().await {
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
        .expect("error while running litfolio");
}
