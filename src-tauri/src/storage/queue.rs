//! Reading queue: prioritized list of papers to read next.

use anyhow::{Context, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::Row;

use super::db::Pool;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueueEntry {
    pub paper_id: String,
    pub priority: i32,
    pub target_date: Option<i64>,
    pub note: Option<String>,
    pub added_at: i64,
    // Joined from papers table for display.
    pub title: Option<String>,
    pub authors: Option<String>,
    pub year: Option<i32>,
}

pub struct QueueRepo<'a> {
    pool: &'a Pool,
}

impl<'a> QueueRepo<'a> {
    pub fn new(pool: &'a Pool) -> Self {
        Self { pool }
    }

    pub async fn list(&self) -> Result<Vec<QueueEntry>> {
        let rows = sqlx::query(
            "SELECT q.paper_id, q.priority, q.target_date, q.note, q.added_at,
                    p.title, p.authors_json, p.year
             FROM reading_queue q
             LEFT JOIN papers p ON p.id = q.paper_id
             ORDER BY q.priority DESC, q.added_at ASC",
        )
        .fetch_all(self.pool)
        .await
        .context("list queue")?;

        Ok(rows
            .into_iter()
            .map(|r| {
                let authors_json: Option<String> = r.try_get("authors_json").unwrap_or(None);
                let authors: Option<String> = authors_json.map(|json| {
                    serde_json::from_str::<Vec<String>>(&json)
                        .unwrap_or_default()
                        .join(", ")
                });
                QueueEntry {
                    paper_id: r.try_get("paper_id").unwrap_or_default(),
                    priority: r.try_get("priority").unwrap_or(0),
                    target_date: r.try_get("target_date").unwrap_or(None),
                    note: r.try_get("note").unwrap_or(None),
                    added_at: r.try_get("added_at").unwrap_or(0),
                    title: r.try_get("title").unwrap_or(None),
                    authors,
                    year: r.try_get("year").unwrap_or(None),
                }
            })
            .collect())
    }

    pub async fn add(
        &self,
        paper_id: &str,
        priority: i32,
        target_date: Option<i64>,
        note: Option<&str>,
    ) -> Result<()> {
        let added_at = Utc::now().timestamp();
        sqlx::query(
            "INSERT OR IGNORE INTO reading_queue (paper_id, priority, target_date, note, added_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
        )
        .bind(paper_id)
        .bind(priority)
        .bind(target_date)
        .bind(note)
        .bind(added_at)
        .execute(self.pool)
        .await
        .context("add to queue")?;
        Ok(())
    }

    pub async fn remove(&self, paper_id: &str) -> Result<()> {
        sqlx::query("DELETE FROM reading_queue WHERE paper_id = ?1")
            .bind(paper_id)
            .execute(self.pool)
            .await
            .context("remove from queue")?;
        Ok(())
    }

    pub async fn update(
        &self,
        paper_id: &str,
        priority: i32,
        target_date: Option<i64>,
        note: Option<&str>,
    ) -> Result<()> {
        let res = sqlx::query(
            "UPDATE reading_queue SET priority = ?1, target_date = ?2, note = ?3 WHERE paper_id = ?4",
        )
        .bind(priority)
        .bind(target_date)
        .bind(note)
        .bind(paper_id)
        .execute(self.pool)
        .await
        .context("update queue entry")?;
        if res.rows_affected() == 0 {
            return Err(anyhow::anyhow!("paper {paper_id} not in queue"));
        }
        Ok(())
    }

    pub async fn reorder(&self, paper_ids: &[String]) -> Result<()> {
        for (i, id) in paper_ids.iter().enumerate() {
            sqlx::query("UPDATE reading_queue SET priority = ?1 WHERE paper_id = ?2")
                .bind((paper_ids.len() - i) as i32)
                .bind(id)
                .execute(self.pool)
                .await
                .context("reorder queue")?;
        }
        Ok(())
    }

    pub async fn contains(&self, paper_id: &str) -> Result<bool> {
        let count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM reading_queue WHERE paper_id = ?1")
                .bind(paper_id)
                .fetch_one(self.pool)
                .await
                .context("check queue membership")?;
        Ok(count > 0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::db::{open_pool, run_migrations};
    use crate::storage::models::{Paper, ReadStatus};
    use crate::storage::papers::PaperRepo;
    use std::path::PathBuf;

    async fn temp_pool() -> (Pool, PathBuf) {
        let dir = std::env::temp_dir().join(format!("litera-q-{}", ulid::Ulid::new()));
        std::fs::create_dir_all(&dir).unwrap();
        let pool = open_pool(&dir.join("library.db")).await.unwrap();
        run_migrations(&pool).await.unwrap();
        (pool, dir)
    }

    async fn seed_paper(pool: &Pool, id: &str, title: &str) {
        let now = Utc::now().timestamp();
        let p = Paper {
            id: id.into(),
            title: title.into(),
            authors: vec!["Author".into()],
            year: Some(2024),
            venue: None,
            doi: None,
            arxiv_id: None,
            abstract_text: None,
            pdf_path: Some(format!("/tmp/{id}.pdf")),
            note_path: None,
            added_at: now,
            updated_at: now,
            read_status: ReadStatus::Unread,
            tldr: None,
            research_question: None,
            method: None,
            dataset: None,
            key_findings: vec![],
            limitations: None,
            comparison: None,
            title_translated: None,
            abstract_translated: None,
            translate_target_lang: None,
            translated_at: None,
            bibtex: None,
            last_exported_at: None,
        };
        PaperRepo::new(pool).insert(&p).await.unwrap();
    }

    #[tokio::test]
    async fn add_list_remove_roundtrip() {
        let (pool, dir) = temp_pool().await;
        seed_paper(&pool, "A", "Paper A").await;
        seed_paper(&pool, "B", "Paper B").await;
        let repo = QueueRepo::new(&pool);

        repo.add("A", 10, None, Some("high priority"))
            .await
            .unwrap();
        repo.add("B", 5, None, None).await.unwrap();

        let list = repo.list().await.unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].paper_id, "A"); // higher priority first
        assert_eq!(list[0].title.as_deref(), Some("Paper A"));
        assert_eq!(list[1].paper_id, "B");

        assert!(repo.contains("A").await.unwrap());
        assert!(!repo.contains("C").await.unwrap());

        repo.remove("A").await.unwrap();
        let list = repo.list().await.unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].paper_id, "B");

        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn reorder_updates_priority() {
        let (pool, dir) = temp_pool().await;
        seed_paper(&pool, "A", "A").await;
        seed_paper(&pool, "B", "B").await;
        seed_paper(&pool, "C", "C").await;
        let repo = QueueRepo::new(&pool);

        repo.add("A", 1, None, None).await.unwrap();
        repo.add("B", 2, None, None).await.unwrap();
        repo.add("C", 3, None, None).await.unwrap();

        repo.reorder(&["B".into(), "A".into(), "C".into()])
            .await
            .unwrap();
        let list = repo.list().await.unwrap();
        assert_eq!(list[0].paper_id, "B"); // highest priority after reorder
        assert_eq!(list[1].paper_id, "A");
        assert_eq!(list[2].paper_id, "C");

        std::fs::remove_dir_all(&dir).ok();
    }
}
