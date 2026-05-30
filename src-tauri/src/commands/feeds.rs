//! IPC commands for RSS / Atom feed subscriptions.
//!
//! Subscription model:
//!   - `feed_add(url)` probes the URL, persists feed metadata + initial items.
//!   - `feed_refresh(id)` is a conditional-GET refresh; same for `feed_refresh_all`.
//!   - `feed_items_list(...)` paginated read.
//!   - Items aren't auto-promoted into papers — the UI sends the user to the
//!     existing 导入 page where they bind a PDF (per project policy: every
//!     paper must have a PDF). After successful import, the UI calls
//!     `feed_item_link_paper` to mark the entry as imported.

use std::sync::Arc;

use tauri::{AppHandle, Emitter, State};

use crate::ingest::fetch_feed;
use crate::storage::{FeedItem, FeedRepo, FeedWithCounts};
use crate::AppState;

const MAX_PAGE_LIMIT: i64 = 200;
const FEED_METADATA_BACKFILL_LIMIT: i64 = 100;

#[tauri::command]
pub async fn feeds_list(state: State<'_, Arc<AppState>>) -> Result<Vec<FeedWithCounts>, String> {
    FeedRepo::new(&state.pool)
        .list()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn feed_add(
    state: State<'_, Arc<AppState>>,
    url: String,
) -> Result<FeedWithCounts, String> {
    let url = url.trim().to_string();
    if url.is_empty() {
        return Err("feed URL is required".into());
    }
    let fetched = fetch_feed(&state.http_external, &url, None, None)
        .await
        .map_err(|e| e.to_string())?;
    let title = fetched
        .title
        .clone()
        .filter(|t| !t.trim().is_empty())
        .unwrap_or_else(|| url.clone());
    let repo = FeedRepo::new(&state.pool);
    let feed = repo
        .create(&url, &title, fetched.description.as_deref())
        .await
        .map_err(|e| e.to_string())?;
    if !fetched.items.is_empty() {
        repo.upsert_items(feed.id, &fetched.items)
            .await
            .map_err(|e| e.to_string())?;
    }
    repo.update_metadata(
        feed.id,
        Some(&title),
        fetched.description.as_deref(),
        fetched.etag.as_deref(),
        fetched.last_modified.as_deref(),
    )
    .await
    .map_err(|e| e.to_string())?;
    feeds_one(&repo, feed.id).await
}

#[tauri::command]
pub async fn feed_remove(state: State<'_, Arc<AppState>>, id: i64) -> Result<(), String> {
    FeedRepo::new(&state.pool)
        .delete(id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn feed_refresh(
    state: State<'_, Arc<AppState>>,
    id: i64,
) -> Result<FeedRefreshResult, String> {
    let repo = FeedRepo::new(&state.pool);
    let feed = repo
        .get(id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "feed not found".to_string())?;
    let fetched_result = fetch_feed(
        &state.http_external,
        &feed.url,
        feed.etag.as_deref(),
        feed.last_modified.as_deref(),
    )
    .await;
    let fetched = match fetched_result {
        Ok(f) => f,
        Err(e) => {
            let msg = e.to_string();
            let _ = repo.record_error(id, &msg).await;
            return Err(msg);
        }
    };
    if fetched.not_modified {
        return Ok(FeedRefreshResult {
            new_items: 0,
            not_modified: true,
        });
    }
    let new_items = repo
        .upsert_items(id, &fetched.items)
        .await
        .map_err(|e| e.to_string())?;
    repo.update_metadata(
        id,
        fetched.title.as_deref(),
        fetched.description.as_deref(),
        fetched.etag.as_deref(),
        fetched.last_modified.as_deref(),
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(FeedRefreshResult {
        new_items,
        not_modified: false,
    })
}

#[tauri::command]
pub async fn feed_refresh_all(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<FeedRefreshAllSummary, String> {
    let repo = FeedRepo::new(&state.pool);
    let feeds = repo.list().await.map_err(|e| e.to_string())?;
    let mut summary = FeedRefreshAllSummary::default();
    for f in feeds {
        let id = f.feed.id;
        match feed_refresh(state.clone(), id).await {
            Ok(r) => {
                summary.new_items += r.new_items as i64;
                if r.not_modified {
                    summary.unchanged += 1;
                } else {
                    summary.refreshed += 1;
                }
            }
            Err(e) => {
                summary.failed += 1;
                summary.errors.push(format!("{}: {}", f.feed.title, e));
            }
        }
    }
    let app_for_backfill = app.clone();
    let state_for_backfill = state.inner().clone();
    tauri::async_runtime::spawn(async move {
        let checked = super::feed_metadata::backfill_unchecked_feed_metadata(
            &state_for_backfill,
            FEED_METADATA_BACKFILL_LIMIT,
        )
        .await;
        let _ = app_for_backfill.emit(
            "feed-metadata-backfill-done",
            serde_json::json!({ "checked": checked }),
        );
    });
    Ok(summary)
}

#[tauri::command]
pub async fn feed_items_list(
    state: State<'_, Arc<AppState>>,
    feed_id: Option<i64>,
    only_unread: Option<bool>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<FeedItem>, String> {
    let limit = limit.unwrap_or(50).clamp(1, MAX_PAGE_LIMIT);
    let offset = offset.unwrap_or(0).max(0);
    FeedRepo::new(&state.pool)
        .list_items(feed_id, only_unread.unwrap_or(false), limit, offset)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn feed_item_set_seen(
    state: State<'_, Arc<AppState>>,
    item_id: String,
    seen: bool,
) -> Result<(), String> {
    FeedRepo::new(&state.pool)
        .set_item_seen(&item_id, seen)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn feed_mark_all_seen(
    state: State<'_, Arc<AppState>>,
    feed_id: i64,
) -> Result<(), String> {
    FeedRepo::new(&state.pool)
        .mark_feed_seen(feed_id)
        .await
        .map_err(|e| e.to_string())
}

/// Mark a feed item as imported by linking it to a paper that the user just
/// created via the 导入 page. Also flips `seen` to true so the entry stops
/// showing up in unread lists. Idempotent.
#[tauri::command]
pub async fn feed_item_link_paper(
    state: State<'_, Arc<AppState>>,
    item_id: String,
    paper_id: String,
) -> Result<(), String> {
    FeedRepo::new(&state.pool)
        .link_imported_paper(&item_id, &paper_id)
        .await
        .map_err(|e| e.to_string())
}

async fn feeds_one(repo: &FeedRepo<'_>, id: i64) -> Result<FeedWithCounts, String> {
    repo.list()
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .find(|f| f.feed.id == id)
        .ok_or_else(|| "feed not found after creation".into())
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct FeedRefreshResult {
    pub new_items: usize,
    pub not_modified: bool,
}

#[derive(Debug, Clone, Default, serde::Serialize)]
pub struct FeedRefreshAllSummary {
    pub refreshed: i64,
    pub unchanged: i64,
    pub failed: i64,
    pub new_items: i64,
    pub metadata_checked: i64,
    pub errors: Vec<String>,
}
