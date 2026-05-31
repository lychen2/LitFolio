use anyhow::{Context, Result};
use chrono::Utc;

use crate::storage::feed_defaults::DEFAULT_FEEDS;

use super::{FeedRepo, Pool};

impl FeedRepo<'_> {
    pub async fn repair_default_feed_urls(&self) -> Result<usize> {
        let mut repaired = 0usize;
        for feed in DEFAULT_FEEDS {
            for legacy_url in feed.legacy_urls {
                repaired += self.repoint_feed_url(legacy_url, feed.url).await?;
            }
        }
        Ok(repaired)
    }

    /// On first launch the user has no feeds; seed a sensible default list of
    /// optics / photonics journal feeds. Only fires when the table is empty,
    /// so deleting a default and restarting doesn't bring it back.
    pub async fn seed_defaults_if_empty(&self) -> Result<usize> {
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM feeds")
            .fetch_one(self.pool)
            .await?;
        if count > 0 {
            return Ok(0);
        }
        let now = Utc::now().timestamp();
        let mut inserted = 0usize;
        for feed in DEFAULT_FEEDS {
            let res = sqlx::query(
                "INSERT OR IGNORE INTO feeds (url, title, created_at) VALUES (?1, ?2, ?3)",
            )
            .bind(feed.url)
            .bind(feed.title)
            .bind(now)
            .execute(self.pool)
            .await?;
            if res.rows_affected() > 0 {
                inserted += 1;
            }
        }
        Ok(inserted)
    }

    async fn repoint_feed_url(&self, old_url: &str, new_url: &str) -> Result<usize> {
        let old_id = find_feed_id_by_url(self.pool, old_url).await?;
        let Some(old_id) = old_id else {
            return Ok(0);
        };
        let new_id = find_feed_id_by_url(self.pool, new_url).await?;
        if let Some(new_id) = new_id {
            self.merge_legacy_feed(old_id, new_id).await?;
            return Ok(1);
        }
        let result = sqlx::query("UPDATE feeds SET url = ?2 WHERE id = ?1")
            .bind(old_id)
            .bind(new_url)
            .execute(self.pool)
            .await?;
        Ok(result.rows_affected() as usize)
    }

    async fn merge_legacy_feed(&self, old_id: i64, new_id: i64) -> Result<()> {
        sqlx::query("UPDATE OR IGNORE feed_items SET feed_id = ?1 WHERE feed_id = ?2")
            .bind(new_id)
            .bind(old_id)
            .execute(self.pool)
            .await?;
        sqlx::query("DELETE FROM feeds WHERE id = ?1")
            .bind(old_id)
            .execute(self.pool)
            .await?;
        Ok(())
    }
}

pub(super) async fn find_feed_id_by_url(pool: &Pool, url: &str) -> Result<Option<i64>> {
    sqlx::query_scalar("SELECT id FROM feeds WHERE url = ?1")
        .bind(url)
        .fetch_optional(pool)
        .await
        .context("find feed by url")
}
