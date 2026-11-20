//! LitFolio backend entry. Wires plugins, state, and command handlers.
#![cfg_attr(test, allow(dead_code))]

mod ai;
mod bibtex;
mod cluster;
mod commands;
mod diagnostics;
mod export;
mod http;
mod index;
mod ingest;
mod legacy_conversion;
#[cfg(feature = "plugin-literature-network")]
mod literature_network;
pub mod mono_contracts;
pub mod network_egress;
mod plugin_host;
mod reading_service;
mod secret;
mod startup;
mod storage;

use std::collections::HashMap;
#[cfg(not(test))]
use tauri::Manager;
use tokio::sync::Mutex as AsyncMutex;
use tokio_util::sync::CancellationToken;
#[cfg(not(test))]
use tracing_subscriber::EnvFilter;

use storage::{LibraryPaths, Pool};

// Re-export for integration testing (examples, external crates).
pub use ingest::{fetch_scihub_pdf_url, scihub_download_pdf};

pub struct AppState {
    /// Live cancellation tokens for in-flight AI dispatches, keyed by
    /// execution-record id. Removed once the dispatch reaches a terminal state.
    pub ai_cancels: AsyncMutex<HashMap<String, CancellationToken>>,
    pub pool: Pool,
    pub paths: LibraryPaths,
    pub http: reqwest::Client,
    /// Hardened client for URLs we got from third-party data (PDF downloads,
    /// RSS feeds). Redirects are capped at 3 hops, require http(s) scheme, and
    /// refuse to land on private/loopback/link-local addresses — the SSRF
    /// defense that stops a malicious server from pivoting us into the local
    /// network or AWS metadata.
    pub http_external: reqwest::Client,
    /// Observable, denied host request boundary. Raw domain reqwest clients are
    /// not covered by this observer and are not claimed by its tests.
    pub host_network: network_egress::HostNetworkState,
    /// Holds the in-flight batch's cancel token (if any). `AsyncMutex` rather
    /// than `std::sync::Mutex` because the batch command handlers hold this
    /// guard around `.await` points (sqlx writes, HTTP calls). A blocking
    /// guard there would pin a tokio worker thread.
    pub batch_cancel: AsyncMutex<Option<CancellationToken>>,
    /// Plugin host authority registry: live instance bindings keyed by
    /// opaque binding id. Disable revokes here before any cleanup.
    pub plugin_host: plugin_host::PluginHostState,
}

#[cfg(not(test))]
fn backend_log_filter() -> EnvFilter {
    EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info"))
        .add_directive(
            "lopdf::object=error"
                .parse()
                .expect("valid lopdf warning suppression filter"),
        )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
#[cfg(not(test))]
pub fn run() {
    #[cfg(not(target_os = "android"))]
    diagnostics::init(backend_log_filter());
    diagnostics::install_panic_hook();

    let builder = tauri::Builder::default();
    #[cfg(target_os = "android")]
    let builder = builder.plugin(reading_service::android_plugin());
    let application = builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .manage(reading_service::ReadingService::default())
        .invoke_handler(commands::command_handlers!())
        .setup(|app| {
            #[cfg(not(target_os = "android"))]
            let resources = app
                .path()
                .resource_dir()
                .map_err(|error| {
                    tracing::warn!(%error, "optional startup task failed: locate bundled manuals");
                })
                .ok();
            #[cfg(target_os = "android")]
            let resources: Option<std::path::PathBuf> = None;
            let state = (|| -> anyhow::Result<_> {
                #[cfg(not(target_os = "android"))]
                let root = storage::default_library_root()?;
                #[cfg(target_os = "android")]
                let root = {
                    let root = app.path().app_data_dir()?.join("Litera-Library");
                    let log = storage::LibraryPaths::new(&root).app_log_file();
                    diagnostics::init_at(backend_log_filter(), Some(log));
                    root
                };
                tauri::async_runtime::block_on(startup::bootstrap_state(root, resources.as_deref()))
            })()
            .map_err(|e| {
                diagnostics::write_fatal(&format!("bootstrap failed: {e}"));
                Box::<dyn std::error::Error>::from(e)
            })?;
            app.manage(state);
            tracing::info!("LitFolio backend booted");
            Ok(())
        })
        .build(tauri::generate_context!())
        .unwrap_or_else(|e| {
            diagnostics::write_fatal(&format!("error while building litfolio: {e}"));
            std::process::exit(1);
        });
    application.run(|app, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            tauri::async_runtime::block_on(
                app.state::<reading_service::ReadingService>().stop(),
            );
        }
    });
}

// Unit tests exercise backend modules and should not require the frontend bundle
// that `tauri::generate_context!()` validates at compile time.
#[cfg(test)]
pub fn run() {}
