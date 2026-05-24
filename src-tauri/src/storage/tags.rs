//! Tag CRUD + paper-tag attach/detach.

use anyhow::{Context, Result};
use sqlx::Row;

use super::db::Pool;
use super::models::Tag;

pub struct TagRepo<'a> {
    pool: &'a Pool,
}

impl<'a> TagRepo<'a> {
    pub fn new(pool: &'a Pool) -> Self {
        Self { pool }
    }

    pub async fn list(&self) -> Result<Vec<TagWithCount>> {
        let rows = sqlx::query(
            "SELECT t.id, t.name, t.parent_id, t.color, COUNT(pt.paper_id) AS paper_count
             FROM tags t LEFT JOIN paper_tags pt ON pt.tag_id = t.id
             GROUP BY t.id ORDER BY t.name COLLATE NOCASE",
        )
        .fetch_all(self.pool)
        .await?;
        rows.into_iter().map(row_to_tag_count).collect()
    }

    pub async fn create(&self, name: &str, color: Option<&str>) -> Result<Tag> {
        let res = sqlx::query("INSERT INTO tags (name, color) VALUES (?1, ?2) RETURNING id")
            .bind(name)
            .bind(color)
            .fetch_one(self.pool)
            .await
            .with_context(|| format!("create tag {name}"))?;
        Ok(Tag {
            id: res.try_get("id")?,
            name: name.to_string(),
            parent_id: None,
            color: color.map(str::to_string),
        })
    }

    pub async fn rename(&self, id: i64, new_name: &str) -> Result<()> {
        sqlx::query("UPDATE tags SET name = ?1 WHERE id = ?2")
            .bind(new_name).bind(id)
            .execute(self.pool).await?;
        Ok(())
    }

    pub async fn set_color(&self, id: i64, color: Option<&str>) -> Result<()> {
        sqlx::query("UPDATE tags SET color = ?1 WHERE id = ?2")
            .bind(color).bind(id)
            .execute(self.pool).await?;
        Ok(())
    }

    pub async fn delete(&self, id: i64) -> Result<()> {
        sqlx::query("DELETE FROM tags WHERE id = ?1").bind(id).execute(self.pool).await?;
        Ok(())
    }

    pub async fn attach(&self, paper_id: &str, tag_id: i64) -> Result<()> {
        sqlx::query("INSERT OR IGNORE INTO paper_tags (paper_id, tag_id) VALUES (?1, ?2)")
            .bind(paper_id).bind(tag_id)
            .execute(self.pool).await?;
        Ok(())
    }

    pub async fn detach(&self, paper_id: &str, tag_id: i64) -> Result<()> {
        sqlx::query("DELETE FROM paper_tags WHERE paper_id = ?1 AND tag_id = ?2")
            .bind(paper_id).bind(tag_id)
            .execute(self.pool).await?;
        Ok(())
    }

    pub async fn for_paper(&self, paper_id: &str) -> Result<Vec<Tag>> {
        let rows = sqlx::query(
            "SELECT t.id, t.name, t.parent_id, t.color
             FROM tags t JOIN paper_tags pt ON pt.tag_id = t.id
             WHERE pt.paper_id = ?1 ORDER BY t.name COLLATE NOCASE",
        )
        .bind(paper_id)
        .fetch_all(self.pool)
        .await?;
        rows.into_iter().map(row_to_tag).collect()
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct TagWithCount {
    pub id: i64,
    pub name: String,
    pub parent_id: Option<i64>,
    pub color: Option<String>,
    pub paper_count: i64,
}

fn row_to_tag_count(row: sqlx::sqlite::SqliteRow) -> Result<TagWithCount> {
    Ok(TagWithCount {
        id: row.try_get("id")?,
        name: row.try_get("name")?,
        parent_id: row.try_get("parent_id").ok(),
        color: row.try_get("color").ok(),
        paper_count: row.try_get("paper_count")?,
    })
}

fn row_to_tag(row: sqlx::sqlite::SqliteRow) -> Result<Tag> {
    Ok(Tag {
        id: row.try_get("id")?,
        name: row.try_get("name")?,
        parent_id: row.try_get("parent_id").ok(),
        color: row.try_get("color").ok(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::db::{open_pool, run_migrations};
    use crate::storage::papers::PaperRepo;
    use crate::storage::models::{Paper, ReadStatus};
    use chrono::Utc;
    use std::path::PathBuf;

    async fn temp() -> (Pool, PathBuf) {
        let dir = std::env::temp_dir().join(format!("litera-tag-{}", ulid::Ulid::new()));
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
            year: None, venue: None, doi: None, arxiv_id: None,
            abstract_text: None, pdf_path: None, note_path: None,
            added_at: now, updated_at: now,
            read_status: ReadStatus::Unread,
            tldr: None, research_question: None, method: None, dataset: None,
            key_findings: vec![], limitations: None, comparison: None,
        }
    }

    #[tokio::test]
    async fn create_list_attach_detach() {
        let (pool, dir) = temp().await;
        let papers = PaperRepo::new(&pool);
        let tags = TagRepo::new(&pool);
        papers.insert(&paper("P1")).await.unwrap();
        let t = tags.create("RAG", Some("#a78bfa")).await.unwrap();
        let t2 = tags.create("transformers", None).await.unwrap();
        tags.attach("P1", t.id).await.unwrap();
        tags.attach("P1", t2.id).await.unwrap();
        let listed = tags.list().await.unwrap();
        assert_eq!(listed.len(), 2);
        let p_tags = tags.for_paper("P1").await.unwrap();
        assert_eq!(p_tags.len(), 2);
        tags.detach("P1", t.id).await.unwrap();
        let p_tags = tags.for_paper("P1").await.unwrap();
        assert_eq!(p_tags.len(), 1);
        assert_eq!(p_tags[0].name, "transformers");
        std::fs::remove_dir_all(&dir).ok();
    }
}
