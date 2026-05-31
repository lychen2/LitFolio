use anyhow::{Context, Result};
use chrono::Utc;
use ulid::Ulid;

use crate::ingest::PaperDraft;

use super::rows::row_to_feed_item;
use super::{FeedItem, FeedRepo, NewFeedItem};

impl FeedRepo<'_> {
    /// Upsert a batch of entries for a feed, returning the count of NEW rows.
    /// Existing `(feed_id, entry_id)` rows are left as-is so the user's "seen"
    /// flag and any imported paper link are preserved across re-fetches.
    pub async fn upsert_items(&self, feed_id: i64, items: &[NewFeedItem]) -> Result<usize> {
        if items.is_empty() {
            return Ok(0);
        }
        let now = Utc::now().timestamp();
        let before = self.count_feed_items(feed_id).await?;
        for item in items {
            self.insert_item_if_missing(feed_id, item, now).await?;
        }
        let after = self.count_feed_items(feed_id).await?;
        Ok((after - before).max(0) as usize)
    }

    async fn count_feed_items(&self, feed_id: i64) -> Result<i64> {
        sqlx::query_scalar("SELECT COUNT(*) FROM feed_items WHERE feed_id = ?1")
            .bind(feed_id)
            .fetch_one(self.pool)
            .await
            .context("count feed_items")
    }

    async fn insert_item_if_missing(
        &self,
        feed_id: i64,
        item: &NewFeedItem,
        fetched_at: i64,
    ) -> Result<()> {
        let authors_json = serde_json::to_string(&item.authors)?;
        let id = Ulid::new().to_string();
        sqlx::query(
            "INSERT OR IGNORE INTO feed_items
                (id, feed_id, entry_id, title, link, summary, authors_json,
                 published_at, fetched_at, seen)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0)",
        )
        .bind(&id)
        .bind(feed_id)
        .bind(&item.entry_id)
        .bind(&item.title)
        .bind(&item.link)
        .bind(&item.summary)
        .bind(&authors_json)
        .bind(item.published_at)
        .bind(fetched_at)
        .execute(self.pool)
        .await
        .with_context(|| {
            format!(
                "insert feed_item feed_id={} entry_id={}",
                feed_id, item.entry_id
            )
        })?;
        Ok(())
    }

    pub async fn get_item(&self, item_id: &str) -> Result<Option<FeedItem>> {
        let row = sqlx::query(
            "SELECT id, feed_id, entry_id, title, link, summary, authors_json,
                    published_at, fetched_at, seen, imported_paper_id,
                    metadata_json, metadata_source, metadata_checked_at
             FROM feed_items WHERE id = ?1",
        )
        .bind(item_id)
        .fetch_optional(self.pool)
        .await
        .context("get feed_item")?;
        row.map(row_to_feed_item).transpose()
    }

    pub async fn list_items(
        &self,
        feed_id: Option<i64>,
        only_unread: bool,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<FeedItem>> {
        let sql = item_list_sql(feed_id.is_some(), only_unread);
        let mut q = sqlx::query(&sql);
        if let Some(fid) = feed_id {
            q = q.bind(fid);
        }
        q = q.bind(limit).bind(offset);
        let rows = q.fetch_all(self.pool).await.context("list feed_items")?;
        rows.into_iter().map(row_to_feed_item).collect()
    }

    pub async fn list_unchecked_items(&self, limit: i64) -> Result<Vec<FeedItem>> {
        let rows = sqlx::query(
            "SELECT id, feed_id, entry_id, title, link, summary, authors_json,
                    published_at, fetched_at, seen, imported_paper_id,
                    metadata_json, metadata_source, metadata_checked_at
             FROM feed_items
             WHERE metadata_checked_at IS NULL
             ORDER BY COALESCE(published_at, fetched_at) DESC
             LIMIT ?1",
        )
        .bind(limit.clamp(1, 500))
        .fetch_all(self.pool)
        .await
        .context("list unchecked feed metadata")?;
        rows.into_iter().map(row_to_feed_item).collect()
    }

    pub async fn save_item_metadata(
        &self,
        item_id: &str,
        metadata: Option<&PaperDraft>,
        source: Option<&str>,
    ) -> Result<()> {
        let now = Utc::now().timestamp();
        let metadata_json = metadata.map(serde_json::to_string).transpose()?;
        sqlx::query(
            "UPDATE feed_items
             SET metadata_json = ?2, metadata_source = ?3, metadata_checked_at = ?4
             WHERE id = ?1",
        )
        .bind(item_id)
        .bind(metadata_json)
        .bind(source)
        .bind(now)
        .execute(self.pool)
        .await
        .context("save feed item metadata")?;
        Ok(())
    }

    pub async fn set_item_seen(&self, item_id: &str, seen: bool) -> Result<()> {
        sqlx::query("UPDATE feed_items SET seen = ?2 WHERE id = ?1")
            .bind(item_id)
            .bind(if seen { 1 } else { 0 })
            .execute(self.pool)
            .await?;
        Ok(())
    }

    pub async fn mark_feed_seen(&self, feed_id: i64) -> Result<()> {
        sqlx::query("UPDATE feed_items SET seen = 1 WHERE feed_id = ?1")
            .bind(feed_id)
            .execute(self.pool)
            .await?;
        Ok(())
    }

    pub async fn link_imported_paper(&self, item_id: &str, paper_id: &str) -> Result<()> {
        sqlx::query("UPDATE feed_items SET imported_paper_id = ?2, seen = 1 WHERE id = ?1")
            .bind(item_id)
            .bind(paper_id)
            .execute(self.pool)
            .await?;
        Ok(())
    }
}

fn item_list_sql(has_feed: bool, only_unread: bool) -> String {
    let mut sql = String::from(
        "SELECT id, feed_id, entry_id, title, link, summary, authors_json,
                published_at, fetched_at, seen, imported_paper_id,
                metadata_json, metadata_source, metadata_checked_at
         FROM feed_items",
    );
    let mut clauses: Vec<&'static str> = Vec::new();
    if has_feed {
        clauses.push("feed_id = ?");
    }
    if only_unread {
        clauses.push("seen = 0");
    }
    append_where(&mut sql, &clauses);
    sql.push_str(" ORDER BY COALESCE(published_at, fetched_at) DESC LIMIT ? OFFSET ?");
    sql
}

fn append_where(sql: &mut String, clauses: &[&str]) {
    if clauses.is_empty() {
        return;
    }
    sql.push_str(" WHERE ");
    sql.push_str(&clauses.join(" AND "));
}
