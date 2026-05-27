//! Paper CRUD repository.

use anyhow::{Context, Result};
use chrono::Utc;
use sqlx::Row;

use super::db::Pool;
use super::models::{Paper, ReadStatus};

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
        .bind(&p.last_exported_at)
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

    /// Full-text search across title / authors / abstract / tldr via the
    /// `papers_fts` virtual table. `query` is a raw FTS5 MATCH expression;
    /// special characters are escaped to be tolerant of user input.
    pub async fn search(&self, query: &str, limit: i64) -> Result<Vec<Paper>> {
        let escaped = escape_fts(query);
        if escaped.is_empty() {
            return self.list_recent(limit).await;
        }
        let rows = sqlx::query(
            "SELECT p.* FROM papers p
             JOIN papers_fts f ON f.rowid = p.rowid
             WHERE papers_fts MATCH ?1
             ORDER BY bm25(papers_fts), p.added_at DESC
             LIMIT ?2",
        )
        .bind(&escaped)
        .bind(limit)
        .fetch_all(self.pool)
        .await
        .with_context(|| format!("search papers query={escaped}"))?;
        rows.into_iter().map(row_to_paper).collect()
    }

    pub async fn count(&self) -> Result<i64> {
        let (c,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM papers")
            .fetch_one(self.pool)
            .await?;
        Ok(c)
    }

    pub async fn set_read_status(&self, id: &str, status: ReadStatus) -> Result<()> {
        let now = Utc::now().timestamp();
        sqlx::query("UPDATE papers SET read_status = ?1, updated_at = ?2 WHERE id = ?3")
            .bind(status.as_str())
            .bind(now)
            .bind(id)
            .execute(self.pool)
            .await?;
        Ok(())
    }

    pub async fn update_tldr(&self, id: &str, tldr: &str, findings: &[String]) -> Result<()> {
        let now = Utc::now().timestamp();
        let findings_json = serde_json::to_string(findings)?;
        sqlx::query(
            "UPDATE papers SET tldr = ?1, key_findings_json = ?2, updated_at = ?3 WHERE id = ?4",
        )
        .bind(tldr)
        .bind(findings_json)
        .bind(now)
        .bind(id)
        .execute(self.pool)
        .await?;
        Ok(())
    }

    pub async fn update_quick_read(
        &self,
        id: &str,
        problem: &str,
        method: &str,
        comparison: &str,
        limitations: &str,
    ) -> Result<()> {
        let now = Utc::now().timestamp();
        sqlx::query(
            "UPDATE papers SET research_question = ?1, method = ?2, comparison = ?3,
                                limitations = ?4, updated_at = ?5 WHERE id = ?6",
        )
        .bind(problem)
        .bind(method)
        .bind(comparison)
        .bind(limitations)
        .bind(now)
        .bind(id)
        .execute(self.pool)
        .await?;
        Ok(())
    }

    pub async fn update_translation(
        &self,
        id: &str,
        title_tx: &str,
        abstract_tx: &str,
        lang: &str,
    ) -> Result<()> {
        let now = Utc::now().timestamp();
        sqlx::query(
            "UPDATE papers SET title_translated = ?1, abstract_translated = ?2,
                                translate_target_lang = ?3, translated_at = ?4,
                                updated_at = ?4 WHERE id = ?5",
        )
        .bind(title_tx)
        .bind(abstract_tx)
        .bind(lang)
        .bind(now)
        .bind(id)
        .execute(self.pool)
        .await?;
        Ok(())
    }

    pub async fn update_pdf_path(&self, id: &str, pdf_path: &str) -> Result<()> {
        if pdf_path.is_empty() {
            return Err(anyhow::anyhow!("pdf_path must not be empty"));
        }
        let now = Utc::now().timestamp();
        let res = sqlx::query("UPDATE papers SET pdf_path = ?1, updated_at = ?2 WHERE id = ?3")
            .bind(pdf_path)
            .bind(now)
            .bind(id)
            .execute(self.pool)
            .await
            .context("update pdf_path")?;
        if res.rows_affected() == 0 {
            return Err(anyhow::anyhow!("paper {id} not found"));
        }
        Ok(())
    }

    pub async fn update_bibtex(&self, id: &str, bibtex: &str) -> Result<()> {
        let now = Utc::now().timestamp();
        sqlx::query("UPDATE papers SET bibtex = ?1, updated_at = ?2 WHERE id = ?3")
            .bind(bibtex)
            .bind(now)
            .bind(id)
            .execute(self.pool)
            .await?;
        Ok(())
    }

    pub async fn update_title_venue(&self, id: &str, title: &str, venue: Option<&str>) -> Result<()> {
        let now = Utc::now().timestamp();
        sqlx::query("UPDATE papers SET title = ?1, venue = ?2, updated_at = ?3 WHERE id = ?4")
            .bind(title)
            .bind(venue)
            .bind(now)
            .bind(id)
            .execute(self.pool)
            .await?;
        Ok(())
    }

    pub async fn list_needing_bibtex(&self) -> Result<Vec<Paper>> {
        let rows = sqlx::query("SELECT * FROM papers WHERE bibtex IS NULL")
            .fetch_all(self.pool)
            .await?;
        rows.into_iter().map(row_to_paper).collect()
    }

    pub async fn update_last_exported_at(&self, id: &str, ts: i64) -> Result<()> {
        sqlx::query("UPDATE papers SET last_exported_at = ?1 WHERE id = ?2")
            .bind(ts)
            .bind(id)
            .execute(self.pool)
            .await?;
        Ok(())
    }

    pub async fn list_needing_export(&self) -> Result<Vec<Paper>> {
        let rows = sqlx::query(
            "SELECT * FROM papers WHERE last_exported_at IS NULL OR updated_at > last_exported_at",
        )
        .fetch_all(self.pool)
        .await?;
        rows.into_iter().map(row_to_paper).collect()
    }

    pub async fn delete(&self, id: &str) -> Result<()> {
        sqlx::query("DELETE FROM papers WHERE id = ?1")
            .bind(id)
            .execute(self.pool)
            .await?;
        Ok(())
    }
}

/// Sanitize raw user input for an FTS5 MATCH query. We split on whitespace,
/// strip FTS-special characters, and AND the terms together. Empty result
/// signals "no constraint, fall back to recent list".
fn escape_fts(input: &str) -> String {
    let pieces: Vec<String> = input
        .split_whitespace()
        .map(|tok| {
            tok.chars()
                .filter(|c| !"\"():.-".contains(*c))
                .collect::<String>()
        })
        .filter(|s| !s.is_empty())
        .map(|s| format!("\"{s}\"*"))
        .collect();
    pieces.join(" AND ")
}

pub(super) fn row_to_paper(row: sqlx::sqlite::SqliteRow) -> Result<Paper> {
    let authors_raw: Option<String> = row.try_get("authors_json").ok();
    let authors: Vec<String> = authors_raw
        .as_deref()
        .map(|s| serde_json::from_str(s).unwrap_or_default())
        .unwrap_or_default();
    let findings_raw: Option<String> = row.try_get("key_findings_json").ok();
    let key_findings: Vec<String> = findings_raw
        .as_deref()
        .map(|s| serde_json::from_str(s).unwrap_or_default())
        .unwrap_or_default();
    let status_str: String = row.try_get("read_status")?;
    Ok(Paper {
        id: row.try_get("id")?,
        title: row.try_get("title")?,
        authors,
        year: row.try_get("year").ok(),
        venue: row.try_get("venue").ok(),
        doi: row.try_get("doi").ok(),
        arxiv_id: row.try_get("arxiv_id").ok(),
        abstract_text: row.try_get("abstract").ok(),
        pdf_path: row.try_get("pdf_path").ok(),
        note_path: row.try_get("note_path").ok(),
        added_at: row.try_get("added_at")?,
        updated_at: row.try_get("updated_at")?,
        read_status: ReadStatus::from_db(&status_str),
        tldr: row.try_get("tldr").ok(),
        research_question: row.try_get("research_question").ok(),
        method: row.try_get("method").ok(),
        dataset: row.try_get("dataset").ok(),
        key_findings,
        limitations: row.try_get("limitations").ok(),
        comparison: row.try_get("comparison").ok(),
        title_translated: row.try_get("title_translated").ok(),
        abstract_translated: row.try_get("abstract_translated").ok(),
        translate_target_lang: row.try_get("translate_target_lang").ok(),
        translated_at: row.try_get("translated_at").ok(),
        bibtex: row.try_get("bibtex").ok(),
        last_exported_at: row.try_get("last_exported_at").ok(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::db::{open_pool, run_migrations};
    use std::path::PathBuf;

    async fn temp_pool() -> (Pool, PathBuf) {
        let dir = std::env::temp_dir().join(format!("litera-paper-{}", ulid::Ulid::new()));
        std::fs::create_dir_all(&dir).unwrap();
        let db = dir.join("library.db");
        let pool = open_pool(&db).await.unwrap();
        run_migrations(&pool).await.unwrap();
        (pool, dir)
    }

    fn sample(id: &str) -> Paper {
        let now = Utc::now().timestamp();
        Paper {
            id: id.into(),
            title: "Attention Is All You Need".into(),
            authors: vec!["Vaswani et al.".into()],
            year: Some(2017),
            venue: Some("NeurIPS".into()),
            doi: Some(format!("10.1234/{id}")),
            arxiv_id: Some(format!("1706.{id}")),
            abstract_text: Some("seq2seq with attention".into()),
            pdf_path: Some(format!("/tmp/test-{id}.pdf")),
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
        }
    }

    #[tokio::test]
    async fn insert_get_list_count_roundtrip() {
        let (pool, dir) = temp_pool().await;
        let repo = PaperRepo::new(&pool);
        repo.insert(&sample("A")).await.unwrap();
        repo.insert(&sample("B")).await.unwrap();
        assert_eq!(repo.count().await.unwrap(), 2);
        let fetched = repo.get("A").await.unwrap().unwrap();
        assert_eq!(fetched.title, "Attention Is All You Need");
        let recent = repo.list_recent(10).await.unwrap();
        assert_eq!(recent.len(), 2);
        repo.set_read_status("A", ReadStatus::Read).await.unwrap();
        let updated = repo.get("A").await.unwrap().unwrap();
        assert_eq!(updated.read_status, ReadStatus::Read);
        repo.delete("B").await.unwrap();
        assert_eq!(repo.count().await.unwrap(), 1);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn update_quick_read_persists_all_four() {
        let (pool, dir) = temp_pool().await;
        let repo = PaperRepo::new(&pool);
        repo.insert(&sample("Q")).await.unwrap();
        repo.update_quick_read("Q", "P", "M", "C", "L")
            .await
            .unwrap();
        let p = repo.get("Q").await.unwrap().unwrap();
        assert_eq!(p.research_question.as_deref(), Some("P"));
        assert_eq!(p.method.as_deref(), Some("M"));
        assert_eq!(p.comparison.as_deref(), Some("C"));
        assert_eq!(p.limitations.as_deref(), Some("L"));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn search_finds_inserted_paper() {
        let (pool, dir) = temp_pool().await;
        let repo = PaperRepo::new(&pool);
        let mut p = sample("S");
        p.title = "Diffusion Models for Image Synthesis".into();
        p.abstract_text = Some("we train denoising networks".into());
        repo.insert(&p).await.unwrap();
        let hits = repo.search("diffusion", 10).await.unwrap();
        assert_eq!(hits.len(), 1);
        let hits = repo.search("denoising image", 10).await.unwrap();
        assert_eq!(hits.len(), 1);
        let hits = repo.search("zzz_no_match", 10).await.unwrap();
        assert!(hits.is_empty());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn escape_fts_handles_empty_and_special() {
        assert_eq!(escape_fts(""), "");
        assert_eq!(escape_fts("   "), "");
        assert_eq!(escape_fts("foo bar"), "\"foo\"* AND \"bar\"*");
        assert_eq!(escape_fts("X(Y).Z"), "\"XYZ\"*");
    }

    #[tokio::test]
    async fn update_translation_roundtrip() {
        let (pool, dir) = temp_pool().await;
        let repo = PaperRepo::new(&pool);
        repo.insert(&sample("T")).await.unwrap();
        repo.update_translation("T", "标题", "摘要内容", "Chinese")
            .await
            .unwrap();
        let p = repo.get("T").await.unwrap().unwrap();
        assert_eq!(p.title_translated.as_deref(), Some("标题"));
        assert_eq!(p.abstract_translated.as_deref(), Some("摘要内容"));
        assert_eq!(p.translate_target_lang.as_deref(), Some("Chinese"));
        assert!(p.translated_at.is_some());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn update_pdf_path_swaps_path_and_rejects_empty_or_missing() {
        let (pool, dir) = temp_pool().await;
        let repo = PaperRepo::new(&pool);
        repo.insert(&sample("P")).await.unwrap();
        repo.update_pdf_path("P", "/tmp/new-location.pdf")
            .await
            .unwrap();
        let p = repo.get("P").await.unwrap().unwrap();
        assert_eq!(p.pdf_path.as_deref(), Some("/tmp/new-location.pdf"));

        assert!(repo.update_pdf_path("P", "").await.is_err());
        assert!(repo
            .update_pdf_path("does-not-exist", "/tmp/x.pdf")
            .await
            .is_err());
        std::fs::remove_dir_all(&dir).ok();
    }
}
