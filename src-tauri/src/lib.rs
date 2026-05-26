//! LitFolio backend entry. Wires plugins, state, and command handlers.

mod ai;
mod cluster;
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
    let http = reqwest::Client::builder()
        .user_agent("LitFolio/0.1")
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
