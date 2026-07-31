//! LitFolio backend entry. Wires plugins, state, and command handlers.
#![cfg_attr(test, allow(dead_code))]

mod ai;
mod bibtex;
mod cluster;
mod commands;
mod diagnostics;
mod discovery;
mod export;
mod http;
mod index;
mod ingest;
mod library_sync;
mod mineru;
pub mod mono_contracts;
pub mod network_egress;
mod secret;
mod startup;
mod storage;

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
    pub sync_lock: AsyncMutex<()>,
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
    diagnostics::init(backend_log_filter());
    diagnostics::install_panic_hook();

    if let Err(e) = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(commands::command_handlers!())
        .setup(|app| {
            let state =
                tauri::async_runtime::block_on(startup::bootstrap_state()).map_err(|e| {
                    diagnostics::write_fatal(&format!("bootstrap failed: {e}"));
                    Box::<dyn std::error::Error>::from(e)
                })?;
            app.manage(state);
            tracing::info!("LitFolio backend booted");
            Ok(())
        })
        .run(tauri::generate_context!())
    {
        diagnostics::write_fatal(&format!("error while running litfolio: {e}"));
        std::process::exit(1);
    }
}

// Unit tests exercise backend modules and should not require the frontend bundle
// that `tauri::generate_context!()` validates at compile time.
#[cfg(test)]
pub fn run() {}
