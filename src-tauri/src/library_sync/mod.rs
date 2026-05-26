mod config;
mod local;
mod webdav;

use anyhow::{Context, Result};
use reqwest::Client;

use crate::storage::{LibraryPaths, Pool};

pub use config::{configured_webdav, load_config, save_config, SyncConfig, WebDavConfig};
pub use local::{SyncConnectionResult, SyncReport};

pub async fn test_connection(client: &Client, cfg: &WebDavConfig) -> Result<SyncConnectionResult> {
    webdav::WebDavRemote::new(client, cfg).probe().await
}

pub async fn push_library(
    client: &Client,
    pool: &Pool,
    paths: &LibraryPaths,
    cfg: &WebDavConfig,
) -> Result<SyncReport> {
    checkpoint_db(pool).await?;
    let snapshot = local::create_snapshot(&paths.root)?;
    let remote = webdav::WebDavRemote::new(client, cfg);
    remote.upload_snapshot(&snapshot).await?;
    Ok(snapshot.report(remote.remote_root(), false))
}

pub async fn pull_library(
    client: &Client,
    pool: &Pool,
    paths: &LibraryPaths,
    cfg: &WebDavConfig,
) -> Result<SyncReport> {
    let remote = webdav::WebDavRemote::new(client, cfg);
    let snapshot = remote.download_snapshot().await?;
    checkpoint_db(pool).await?;
    pool.close().await;
    local::replace_library_root(&paths.root, snapshot.root())?;
    Ok(snapshot.report(remote.remote_root(), true))
}

async fn checkpoint_db(pool: &Pool) -> Result<()> {
    sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)")
        .execute(pool)
        .await
        .context("checkpoint sqlite before sync")?;
    Ok(())
}
