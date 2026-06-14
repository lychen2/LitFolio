mod config;
mod local;
mod webdav;

use anyhow::{Context, Result};
use reqwest::Client;
use std::collections::HashSet;

use crate::storage::{LibraryPaths, Pool};

pub use config::{configured_webdav, load_config, save_config, SyncConfig, WebDavConfig};
pub use local::{SyncConnectionResult, SyncPreviewReport, SyncReport};

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
    let paper_ids = synced_paper_ids(pool).await?;
    let snapshot = local::create_snapshot_for_papers(&paths.root, &paper_ids)?;
    let remote = webdav::WebDavRemote::new(client, cfg);
    let stats = remote.upload_snapshot(&snapshot).await?;
    Ok(snapshot.report_with_stats(remote.remote_root(), stats, false))
}

pub async fn pull_library(
    client: &Client,
    pool: &Pool,
    paths: &LibraryPaths,
    cfg: &WebDavConfig,
) -> Result<SyncReport> {
    let remote = webdav::WebDavRemote::new(client, cfg);
    checkpoint_db(pool).await?;
    let paper_ids = synced_paper_ids(pool).await?;
    let local_snapshot = local::create_snapshot_for_papers(&paths.root, &paper_ids)?;
    let (snapshot, stats) = remote
        .download_snapshot_reusing(Some(&local_snapshot))
        .await?;
    pool.close().await;
    local::replace_library_root(&paths.root, snapshot.root())?;
    Ok(snapshot.report_with_stats(remote.remote_root(), stats, true))
}

pub async fn preview_push_library(
    client: &Client,
    pool: &Pool,
    paths: &LibraryPaths,
    cfg: &WebDavConfig,
) -> Result<SyncPreviewReport> {
    checkpoint_db(pool).await?;
    let paper_ids = synced_paper_ids(pool).await?;
    let snapshot = local::create_snapshot_for_papers(&paths.root, &paper_ids)?;
    webdav::WebDavRemote::new(client, cfg)
        .preview_upload(&snapshot)
        .await
}

pub async fn preview_pull_library(
    client: &Client,
    pool: &Pool,
    paths: &LibraryPaths,
    cfg: &WebDavConfig,
) -> Result<SyncPreviewReport> {
    checkpoint_db(pool).await?;
    let paper_ids = synced_paper_ids(pool).await?;
    let local_snapshot = local::create_snapshot_for_papers(&paths.root, &paper_ids)?;
    webdav::WebDavRemote::new(client, cfg)
        .preview_download(&local_snapshot)
        .await
}

async fn synced_paper_ids(pool: &Pool) -> Result<HashSet<String>> {
    let ids = sqlx::query_scalar::<_, String>("SELECT id FROM papers")
        .fetch_all(pool)
        .await
        .context("list paper ids for sync snapshot")?;
    Ok(ids.into_iter().collect())
}

async fn checkpoint_db(pool: &Pool) -> Result<()> {
    sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)")
        .execute(pool)
        .await
        .context("checkpoint sqlite before sync")?;
    Ok(())
}
