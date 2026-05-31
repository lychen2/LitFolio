//! Feed + feed_item storage repository.
//!
//! Feeds are user-subscribed RSS/Atom URLs. Items are the cached entries we've
//! pulled. Item de-duplication is on `(feed_id, entry_id)` so re-running a fetch
//! never produces duplicates even if the upstream feed re-emits the same guid.

use anyhow::{Context, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::Row;

use super::db::Pool;
use crate::ingest::PaperDraft;

mod defaults;
mod items;
mod rows;
#[cfg(test)]
mod tests;

use rows::{row_to_feed, row_to_feed_with_counts};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Feed {
    pub id: i64,
    pub url: String,
    pub title: String,
    pub description: Option<String>,
    pub etag: Option<String>,
    pub last_modified: Option<String>,
    pub last_fetched_at: Option<i64>,
    pub last_error: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct FeedWithCounts {
    #[serde(flatten)]
    pub feed: Feed,
    pub total_items: i64,
    pub unread_items: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeedItem {
    pub id: String,
    pub feed_id: i64,
    pub entry_id: String,
    pub title: String,
    pub link: Option<String>,
    pub summary: Option<String>,
    pub authors: Vec<String>,
    pub published_at: Option<i64>,
    pub fetched_at: i64,
    pub seen: bool,
    pub imported_paper_id: Option<String>,
    pub metadata: Option<PaperDraft>,
    pub metadata_source: Option<String>,
    pub metadata_checked_at: Option<i64>,
}

/// Parsed entry from feed-rs that the ingest layer hands to the repo.
#[derive(Debug, Clone)]
pub struct NewFeedItem {
    pub entry_id: String,
    pub title: String,
    pub link: Option<String>,
    pub summary: Option<String>,
    pub authors: Vec<String>,
    pub published_at: Option<i64>,
}

pub struct FeedRepo<'a> {
    pool: &'a Pool,
}

impl<'a> FeedRepo<'a> {
    pub fn new(pool: &'a Pool) -> Self {
        Self { pool }
    }

    pub async fn list(&self) -> Result<Vec<FeedWithCounts>> {
        let rows = sqlx::query(
            "SELECT f.id, f.url, f.title, f.description, f.etag, f.last_modified,
                    f.last_fetched_at, f.last_error, f.created_at,
                    COUNT(i.id) AS total_items,
                    COALESCE(SUM(CASE WHEN i.seen = 0 THEN 1 ELSE 0 END), 0) AS unread_items
             FROM feeds f LEFT JOIN feed_items i ON i.feed_id = f.id
             GROUP BY f.id ORDER BY f.created_at DESC",
        )
        .fetch_all(self.pool)
        .await
        .context("list feeds")?;
        rows.into_iter().map(row_to_feed_with_counts).collect()
    }

    pub async fn create(&self, url: &str, title: &str, description: Option<&str>) -> Result<Feed> {
        let now = Utc::now().timestamp();
        let row = sqlx::query(
            "INSERT INTO feeds (url, title, description, created_at)
             VALUES (?1, ?2, ?3, ?4) RETURNING id",
        )
        .bind(url)
        .bind(title)
        .bind(description)
        .bind(now)
        .fetch_one(self.pool)
        .await
        .with_context(|| format!("insert feed {url}"))?;
        Ok(Feed {
            id: row.try_get("id")?,
            url: url.into(),
            title: title.into(),
            description: description.map(str::to_string),
            etag: None,
            last_modified: None,
            last_fetched_at: None,
            last_error: None,
            created_at: now,
        })
    }

    pub async fn delete(&self, id: i64) -> Result<()> {
        sqlx::query("DELETE FROM feeds WHERE id = ?1")
            .bind(id)
            .execute(self.pool)
            .await?;
        Ok(())
    }

    pub async fn get(&self, id: i64) -> Result<Option<Feed>> {
        let row = sqlx::query(
            "SELECT id, url, title, description, etag, last_modified,
                    last_fetched_at, last_error, created_at FROM feeds WHERE id = ?1",
        )
        .bind(id)
        .fetch_optional(self.pool)
        .await?;
        row.map(row_to_feed).transpose()
    }

    pub async fn update_metadata(
        &self,
        id: i64,
        title: Option<&str>,
        description: Option<&str>,
        etag: Option<&str>,
        last_modified: Option<&str>,
    ) -> Result<()> {
        let now = Utc::now().timestamp();
        sqlx::query(
            "UPDATE feeds SET
                title = COALESCE(?2, title),
                description = COALESCE(?3, description),
                etag = ?4,
                last_modified = ?5,
                last_fetched_at = ?6,
                last_error = NULL
             WHERE id = ?1",
        )
        .bind(id)
        .bind(title)
        .bind(description)
        .bind(etag)
        .bind(last_modified)
        .bind(now)
        .execute(self.pool)
        .await?;
        Ok(())
    }

    pub async fn record_error(&self, id: i64, error: &str) -> Result<()> {
        let now = Utc::now().timestamp();
        sqlx::query("UPDATE feeds SET last_error = ?2, last_fetched_at = ?3 WHERE id = ?1")
            .bind(id)
            .bind(error)
            .bind(now)
            .execute(self.pool)
            .await?;
        Ok(())
    }
}
