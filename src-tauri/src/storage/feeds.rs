//! Feed + feed_item storage repository.
//!
//! Feeds are user-subscribed RSS/Atom URLs. Items are the cached entries we've
//! pulled. Item de-duplication is on `(feed_id, entry_id)` so re-running a fetch
//! never produces duplicates even if the upstream feed re-emits the same guid.

use anyhow::{Context, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::Row;
use ulid::Ulid;

use super::db::Pool;

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
        sqlx::query(
            "UPDATE feeds SET last_error = ?2, last_fetched_at = ?3 WHERE id = ?1",
        )
        .bind(id)
        .bind(error)
        .bind(now)
        .execute(self.pool)
        .await?;
        Ok(())
    }

    /// Upsert a batch of entries for a feed, returning the count of NEW rows.
    /// Existing `(feed_id, entry_id)` rows are left as-is so the user's "seen"
    /// flag and any imported paper link are preserved across re-fetches.
    pub async fn upsert_items(&self, feed_id: i64, items: &[NewFeedItem]) -> Result<usize> {
        if items.is_empty() {
            return Ok(0);
        }
        let now = Utc::now().timestamp();
        let before: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM feed_items WHERE feed_id = ?1")
                .bind(feed_id)
                .fetch_one(self.pool)
                .await?;
        for item in items {
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
            .bind(now)
            .execute(self.pool)
            .await
            .with_context(|| {
                format!(
                    "insert feed_item feed_id={} entry_id={}",
                    feed_id, item.entry_id
                )
            })?;
        }
        let after: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM feed_items WHERE feed_id = ?1")
                .bind(feed_id)
                .fetch_one(self.pool)
                .await?;
        Ok((after - before).max(0) as usize)
    }

    pub async fn list_items(
        &self,
        feed_id: Option<i64>,
        only_unread: bool,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<FeedItem>> {
        // Build the WHERE clause with anonymous `?` markers throughout. Mixing
        // `?N` and `?` in one statement has caused sqlx to bind in the wrong
        // positional order on some sqlite + sqlx combinations.
        let mut sql = String::from(
            "SELECT id, feed_id, entry_id, title, link, summary, authors_json,
                    published_at, fetched_at, seen, imported_paper_id
             FROM feed_items",
        );
        let mut clauses: Vec<&'static str> = Vec::new();
        if feed_id.is_some() {
            clauses.push("feed_id = ?");
        }
        if only_unread {
            clauses.push("seen = 0");
        }
        if !clauses.is_empty() {
            sql.push_str(" WHERE ");
            sql.push_str(&clauses.join(" AND "));
        }
        sql.push_str(" ORDER BY COALESCE(published_at, fetched_at) DESC LIMIT ? OFFSET ?");

        let mut q = sqlx::query(&sql);
        if let Some(fid) = feed_id {
            q = q.bind(fid);
        }
        q = q.bind(limit).bind(offset);
        let rows = q.fetch_all(self.pool).await.context("list feed_items")?;
        rows.into_iter().map(row_to_feed_item).collect()
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
        let defaults: &[(&str, &str)] = &[
            ("Nature Photonics", "https://www.nature.com/nphoton.rss"),
            ("Optica", "https://opg.optica.org/optica/rss.cfm"),
            ("Optics Letters", "https://opg.optica.org/ol/rss.cfm"),
            ("Optics Express", "https://opg.optica.org/oe/rss.cfm"),
            ("Journal of the Optical Society of America B", "https://opg.optica.org/josab/rss.cfm"),
            ("ACS Photonics", "https://pubs.acs.org/action/showFeed?type=etoc&feed=rss&jc=apchd5"),
            ("Photonics Research", "https://opg.optica.org/prj/rss.cfm"),
            ("Progress in Quantum Electronics", "https://rss.sciencedirect.com/publication/science/00796727"),
            ("Applied Optics", "https://opg.optica.org/ao/rss.cfm"),
            ("Journal of the Optical Society of America A", "https://opg.optica.org/josaa/rss.cfm"),
        ];
        let now = Utc::now().timestamp();
        let mut inserted = 0usize;
        for (title, url) in defaults {
            let res = sqlx::query(
                "INSERT OR IGNORE INTO feeds (url, title, created_at) VALUES (?1, ?2, ?3)",
            )
            .bind(url)
            .bind(title)
            .bind(now)
            .execute(self.pool)
            .await?;
            if res.rows_affected() > 0 {
                inserted += 1;
            }
        }
        Ok(inserted)
    }
}

fn row_to_feed(row: sqlx::sqlite::SqliteRow) -> Result<Feed> {
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

fn row_to_feed_with_counts(row: sqlx::sqlite::SqliteRow) -> Result<FeedWithCounts> {
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

fn row_to_feed_item(row: sqlx::sqlite::SqliteRow) -> Result<FeedItem> {
    let authors_raw: String = row.try_get("authors_json")?;
    let authors: Vec<String> = serde_json::from_str(&authors_raw).unwrap_or_default();
    let seen: i64 = row.try_get("seen")?;
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
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::db::{open_pool, run_migrations};
    use std::path::PathBuf;

    async fn temp() -> (Pool, PathBuf) {
        let dir = std::env::temp_dir().join(format!("litera-feeds-{}", ulid::Ulid::new()));
        std::fs::create_dir_all(&dir).unwrap();
        let pool = open_pool(&dir.join("db.sqlite")).await.unwrap();
        run_migrations(&pool).await.unwrap();
        (pool, dir)
    }

    #[tokio::test]
    async fn create_list_upsert_roundtrip() {
        let (pool, dir) = temp().await;
        let repo = FeedRepo::new(&pool);
        let feed = repo
            .create("https://example.com/feed", "Example", Some("desc"))
            .await
            .unwrap();
        let items = vec![
            NewFeedItem {
                entry_id: "a".into(),
                title: "First".into(),
                link: Some("https://example.com/a".into()),
                summary: None,
                authors: vec!["Alice".into()],
                published_at: Some(1700000000),
            },
            NewFeedItem {
                entry_id: "b".into(),
                title: "Second".into(),
                link: None,
                summary: Some("body".into()),
                authors: vec![],
                published_at: None,
            },
        ];
        let n = repo.upsert_items(feed.id, &items).await.unwrap();
        assert_eq!(n, 2);
        // Re-running with same entry_ids must be a no-op.
        let n2 = repo.upsert_items(feed.id, &items).await.unwrap();
        assert_eq!(n2, 0);

        let listed = repo.list().await.unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].total_items, 2);
        assert_eq!(listed[0].unread_items, 2);

        let entries = repo.list_items(Some(feed.id), false, 10, 0).await.unwrap();
        assert_eq!(entries.len(), 2);
        // ORDER BY COALESCE(published_at, fetched_at) DESC — "Second" has no
        // published_at so it falls back to fetched_at = now (much larger than
        // "First"'s 2023 unix ts), so "Second" sorts first.
        assert_eq!(entries[0].title, "Second");
        assert_eq!(entries[1].title, "First");

        repo.set_item_seen(&entries[1].id, true).await.unwrap();
        let unread = repo.list_items(Some(feed.id), true, 10, 0).await.unwrap();
        assert_eq!(unread.len(), 1);
        assert_eq!(unread[0].title, "Second");

        std::fs::remove_dir_all(&dir).ok();
    }
}
