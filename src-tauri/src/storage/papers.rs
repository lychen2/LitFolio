//! Paper CRUD repository.

use anyhow::{Context, Result};
use sqlx::Row;

use super::db::Pool;
use super::models::Paper;

mod rows;
#[cfg(test)]
mod tests;
mod updates;

pub(crate) use rows::row_to_paper;

pub struct PaperRepo<'a> {
    pool: &'a Pool,
}

impl<'a> PaperRepo<'a> {
    pub fn new(pool: &'a Pool) -> Self {
        Self { pool }
    }

    pub async fn insert(&self, p: &Paper) -> Result<()> {
        let authors_json = serde_json::to_string(&p.authors)?;
        let findings_json = serde_json::to_string(&p.key_findings)?;
        if p.pdf_path.as_deref().map(str::is_empty).unwrap_or(true) {
            return Err(anyhow::anyhow!(
                "a paper must have a PDF file (pdf_path is required)"
            ));
        }
        sqlx::query(
            "INSERT INTO papers (id, title, authors_json, year, venue, doi, arxiv_id, abstract,
                                  pdf_path, note_path, added_at, updated_at, read_status, tldr,
                                  research_question, method, dataset, key_findings_json, limitations,
                                  comparison, bibtex, last_exported_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22)",
        )
        .bind(&p.id)
        .bind(&p.title)
        .bind(&authors_json)
        .bind(p.year)
        .bind(&p.venue)
        .bind(&p.doi)
        .bind(&p.arxiv_id)
        .bind(&p.abstract_text)
        .bind(&p.pdf_path)
        .bind(&p.note_path)
        .bind(p.added_at)
        .bind(p.updated_at)
        .bind(p.read_status.as_str())
        .bind(&p.tldr)
        .bind(&p.research_question)
        .bind(&p.method)
        .bind(&p.dataset)
        .bind(&findings_json)
        .bind(&p.limitations)
        .bind(&p.comparison)
        .bind(&p.bibtex)
        .bind(p.last_exported_at)
        .execute(self.pool)
        .await
        .context("insert paper")?;
        Ok(())
    }

    pub async fn get(&self, id: &str) -> Result<Option<Paper>> {
        let row = sqlx::query("SELECT * FROM papers WHERE id = ?1")
            .bind(id)
            .fetch_optional(self.pool)
            .await?;
        row.map(row_to_paper).transpose()
    }

    pub async fn find_by_arxiv_id(&self, arxiv_id: &str) -> Result<Option<Paper>> {
        let row = sqlx::query("SELECT * FROM papers WHERE arxiv_id = ?1")
            .bind(arxiv_id)
            .fetch_optional(self.pool)
            .await?;
        row.map(row_to_paper).transpose()
    }

    pub async fn find_by_doi(&self, doi: &str) -> Result<Option<Paper>> {
        let normalized = doi.trim().to_lowercase();
        if normalized.is_empty() {
            return Ok(None);
        }
        let row = sqlx::query("SELECT * FROM papers WHERE lower(trim(doi)) = ?1")
            .bind(normalized)
            .fetch_optional(self.pool)
            .await?;
        row.map(row_to_paper).transpose()
    }

    pub async fn list_all_arxiv_ids(&self) -> Result<Vec<String>> {
        let rows = sqlx::query(
            "SELECT arxiv_id FROM papers WHERE arxiv_id IS NOT NULL AND arxiv_id != ''",
        )
        .fetch_all(self.pool)
        .await?;
        Ok(rows
            .into_iter()
            .filter_map(|r| r.try_get::<String, _>("arxiv_id").ok())
            .collect())
    }

    pub async fn list_all(&self) -> Result<Vec<Paper>> {
        let rows = sqlx::query("SELECT * FROM papers ORDER BY added_at DESC")
            .fetch_all(self.pool)
            .await?;
        rows.into_iter().map(row_to_paper).collect()
    }

    pub async fn list_recent(&self, limit: i64) -> Result<Vec<Paper>> {
        let rows = sqlx::query("SELECT * FROM papers ORDER BY added_at DESC LIMIT ?1")
            .bind(limit)
            .fetch_all(self.pool)
            .await?;
        rows.into_iter().map(row_to_paper).collect()
    }

    pub async fn list_by_folder(&self, folder_id: i64, limit: i64) -> Result<Vec<Paper>> {
        let rows = sqlx::query(
            "SELECT p.* FROM papers p
             JOIN paper_folders pf ON pf.paper_id = p.id
             WHERE pf.folder_id = ?1
             ORDER BY p.added_at DESC LIMIT ?2",
        )
        .bind(folder_id)
        .bind(limit)
        .fetch_all(self.pool)
        .await?;
        rows.into_iter().map(row_to_paper).collect()
    }

    pub async fn search_by_folder(
        &self,
        folder_id: i64,
        query: &str,
        limit: i64,
    ) -> Result<Vec<Paper>> {
        let escaped = super::retrieval::escape_fts(query);
        if escaped.is_empty() {
            return self.list_by_folder(folder_id, limit).await;
        }
        let rows = sqlx::query(
            "SELECT p.* FROM papers p
             JOIN paper_folders pf ON pf.paper_id = p.id
             JOIN papers_fts f ON f.rowid = p.rowid
             WHERE pf.folder_id = ?1 AND papers_fts MATCH ?2
             ORDER BY bm25(papers_fts), p.added_at DESC
             LIMIT ?3",
        )
        .bind(folder_id)
        .bind(escaped)
        .bind(limit)
        .fetch_all(self.pool)
        .await?;
        rows.into_iter().map(row_to_paper).collect()
    }

    /// Full-text search across title / authors / abstract / tldr via the
    /// `papers_fts` virtual table. Delegates to [`super::retrieval`] for
    /// FTS5 query building and execution.
    pub async fn search(&self, query: &str, limit: i64) -> Result<Vec<Paper>> {
        let escaped = super::retrieval::escape_fts(query);
        if escaped.is_empty() {
            return self.list_recent(limit).await;
        }
        super::retrieval::search_papers(self.pool, &escaped, limit).await
    }

    /// Broader OR-based search — each whitespace-separated token is an
    /// independent prefix query. Used as a fallback when the strict AND
    /// search returns nothing.
    pub async fn search_or(&self, query: &str, limit: i64) -> Result<Vec<Paper>> {
        let escaped = super::retrieval::escape_fts_or(query);
        if escaped.is_empty() {
            return self.list_recent(limit).await;
        }
        super::retrieval::search_papers_or(self.pool, &escaped, limit).await
    }

    pub async fn count(&self) -> Result<i64> {
        let (c,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM papers")
            .fetch_one(self.pool)
            .await?;
        Ok(c)
    }

    pub async fn delete(&self, id: &str) -> Result<()> {
        sqlx::query("DELETE FROM papers WHERE id = ?1")
            .bind(id)
            .execute(self.pool)
            .await?;
        Ok(())
    }
}
