//! Folder CRUD + paper-folder attach/detach.

use anyhow::{Context, Result};
use sqlx::Row;

use super::db::Pool;
use super::models::Folder;

pub struct FolderRepo<'a> {
    pool: &'a Pool,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct FolderWithCount {
    pub id: i64,
    pub name: String,
    pub parent_id: Option<i64>,
    pub paper_count: i64,
}

impl<'a> FolderRepo<'a> {
    pub fn new(pool: &'a Pool) -> Self {
        Self { pool }
    }

    pub async fn list(&self) -> Result<Vec<FolderWithCount>> {
        let rows = sqlx::query(
            "SELECT f.id, f.name, f.parent_id, COUNT(pf.paper_id) AS paper_count
             FROM folders f LEFT JOIN paper_folders pf ON pf.folder_id = f.id
             GROUP BY f.id ORDER BY f.parent_id IS NOT NULL, f.name COLLATE NOCASE",
        )
        .fetch_all(self.pool)
        .await?;
        rows.into_iter().map(row_to_folder_count).collect()
    }

    pub async fn create(&self, name: &str, parent_id: Option<i64>) -> Result<Folder> {
        let row = sqlx::query("INSERT INTO folders (name, parent_id) VALUES (?1, ?2) RETURNING id")
            .bind(name)
            .bind(parent_id)
            .fetch_one(self.pool)
            .await
            .with_context(|| format!("create folder {name}"))?;
        Ok(Folder {
            id: row.try_get("id")?,
            name: name.to_string(),
            parent_id,
        })
    }

    pub async fn rename(&self, id: i64, name: &str) -> Result<()> {
        sqlx::query("UPDATE folders SET name = ?1 WHERE id = ?2")
            .bind(name)
            .bind(id)
            .execute(self.pool)
            .await?;
        Ok(())
    }

    pub async fn delete(&self, id: i64) -> Result<()> {
        sqlx::query("DELETE FROM folders WHERE id = ?1")
            .bind(id)
            .execute(self.pool)
            .await?;
        Ok(())
    }

    pub async fn attach(&self, paper_id: &str, folder_id: i64) -> Result<()> {
        sqlx::query("INSERT OR IGNORE INTO paper_folders (paper_id, folder_id) VALUES (?1, ?2)")
            .bind(paper_id)
            .bind(folder_id)
            .execute(self.pool)
            .await?;
        Ok(())
    }

    pub async fn detach(&self, paper_id: &str, folder_id: i64) -> Result<()> {
        sqlx::query("DELETE FROM paper_folders WHERE paper_id = ?1 AND folder_id = ?2")
            .bind(paper_id)
            .bind(folder_id)
            .execute(self.pool)
            .await?;
        Ok(())
    }

    pub async fn for_paper(&self, paper_id: &str) -> Result<Vec<Folder>> {
        let rows = sqlx::query(
            "SELECT f.id, f.name, f.parent_id
             FROM folders f JOIN paper_folders pf ON pf.folder_id = f.id
             WHERE pf.paper_id = ?1 ORDER BY f.name COLLATE NOCASE",
        )
        .bind(paper_id)
        .fetch_all(self.pool)
        .await?;
        rows.into_iter().map(row_to_folder).collect()
    }
}

fn row_to_folder_count(row: sqlx::sqlite::SqliteRow) -> Result<FolderWithCount> {
    Ok(FolderWithCount {
        id: row.try_get("id")?,
        name: row.try_get("name")?,
        parent_id: row.try_get("parent_id").ok(),
        paper_count: row.try_get("paper_count")?,
    })
}

fn row_to_folder(row: sqlx::sqlite::SqliteRow) -> Result<Folder> {
    Ok(Folder {
        id: row.try_get("id")?,
        name: row.try_get("name")?,
        parent_id: row.try_get("parent_id").ok(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::db::{open_pool, run_migrations};
    use crate::storage::models::{Paper, ReadStatus};
    use crate::storage::papers::PaperRepo;
    use chrono::Utc;
    use std::path::PathBuf;

    async fn temp() -> (Pool, PathBuf) {
        let dir = std::env::temp_dir().join(format!("litera-folder-{}", ulid::Ulid::new()));
        std::fs::create_dir_all(&dir).unwrap();
        let pool = open_pool(&dir.join("db.sqlite")).await.unwrap();
        run_migrations(&pool).await.unwrap();
        (pool, dir)
    }

    fn paper(id: &str) -> Paper {
        let now = Utc::now().timestamp();
        Paper {
            id: id.into(),
            title: "T".into(),
            authors: vec![],
            year: None,
            venue: None,
            doi: None,
            arxiv_id: None,
            abstract_text: None,
            pdf_path: Some("/tmp/test.pdf".into()),
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
        }
    }

    #[tokio::test]
    async fn create_attach_detach_roundtrip() {
        let (pool, dir) = temp().await;
        PaperRepo::new(&pool).insert(&paper("P1")).await.unwrap();
        let folders = FolderRepo::new(&pool);
        let root = folders.create("Physics", None).await.unwrap();
        let child = folders.create("Optics", Some(root.id)).await.unwrap();
        folders.attach("P1", child.id).await.unwrap();
        let linked = folders.for_paper("P1").await.unwrap();
        assert_eq!(linked.len(), 1);
        assert_eq!(linked[0].name, "Optics");
        folders.detach("P1", child.id).await.unwrap();
        assert!(folders.for_paper("P1").await.unwrap().is_empty());
        std::fs::remove_dir_all(&dir).ok();
    }
}
