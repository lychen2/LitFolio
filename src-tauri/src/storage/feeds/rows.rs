use anyhow::Result;
use sqlx::Row;

use super::{Feed, FeedItem, FeedWithCounts};

pub(super) fn row_to_feed(row: sqlx::sqlite::SqliteRow) -> Result<Feed> {
    Ok(Feed {
        id: row.try_get("id")?,
        url: row.try_get("url")?,
        title: row.try_get("title")?,
        description: row.try_get("description").ok(),
        etag: row.try_get("etag").ok(),
        last_modified: row.try_get("last_modified").ok(),
        last_fetched_at: row.try_get("last_fetched_at").ok(),
        last_error: row.try_get("last_error").ok(),
        created_at: row.try_get("created_at")?,
    })
}

pub(super) fn row_to_feed_with_counts(row: sqlx::sqlite::SqliteRow) -> Result<FeedWithCounts> {
    Ok(FeedWithCounts {
        feed: row_to_feed_inline(&row)?,
        total_items: row.try_get("total_items")?,
        unread_items: row.try_get("unread_items")?,
    })
}

fn row_to_feed_inline(row: &sqlx::sqlite::SqliteRow) -> Result<Feed> {
    Ok(Feed {
        id: row.try_get("id")?,
        url: row.try_get("url")?,
        title: row.try_get("title")?,
        description: row.try_get("description").ok(),
        etag: row.try_get("etag").ok(),
        last_modified: row.try_get("last_modified").ok(),
        last_fetched_at: row.try_get("last_fetched_at").ok(),
        last_error: row.try_get("last_error").ok(),
        created_at: row.try_get("created_at")?,
    })
}

pub(super) fn row_to_feed_item(row: sqlx::sqlite::SqliteRow) -> Result<FeedItem> {
    let authors_raw: String = row.try_get("authors_json")?;
    let authors: Vec<String> = serde_json::from_str(&authors_raw).unwrap_or_default();
    let seen: i64 = row.try_get("seen")?;
    let metadata_raw: Option<String> = row.try_get("metadata_json").ok();
    let metadata = metadata_raw.and_then(|raw| serde_json::from_str(&raw).ok());
    Ok(FeedItem {
        id: row.try_get("id")?,
        feed_id: row.try_get("feed_id")?,
        entry_id: row.try_get("entry_id")?,
        title: row.try_get("title")?,
        link: row.try_get("link").ok(),
        summary: row.try_get("summary").ok(),
        authors,
        published_at: row.try_get("published_at").ok(),
        fetched_at: row.try_get("fetched_at")?,
        seen: seen != 0,
        imported_paper_id: row.try_get("imported_paper_id").ok(),
        metadata,
        metadata_source: row.try_get("metadata_source").ok(),
        metadata_checked_at: row.try_get("metadata_checked_at").ok(),
    })
}
