use anyhow::{Context, Result};
use chrono::Utc;

use crate::storage::models::{Paper, ReadStatus};

use super::{row_to_paper, PaperRepo};

impl PaperRepo<'_> {
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

    pub async fn update_title_venue(
        &self,
        id: &str,
        title: &str,
        venue: Option<&str>,
    ) -> Result<()> {
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

    /// Overwrite the bibliographic metadata of an existing paper from `p`
    /// (title, authors, year, venue, abstract, doi, bibtex). Used when the
    /// user supplies a DOI for a paper whose metadata wasn't recognized and we
    /// re-fetch it from CrossRef. The FTS index stays in sync via the
    /// `papers_au` AFTER UPDATE trigger.
    pub async fn update_metadata(&self, p: &Paper) -> Result<()> {
        let authors_json = serde_json::to_string(&p.authors)?;
        let now = Utc::now().timestamp();
        let res = sqlx::query(
            "UPDATE papers
             SET title = ?1, authors_json = ?2, year = ?3, venue = ?4,
                 abstract = ?5, doi = ?6, bibtex = ?7, updated_at = ?8
             WHERE id = ?9",
        )
        .bind(&p.title)
        .bind(&authors_json)
        .bind(p.year)
        .bind(&p.venue)
        .bind(&p.abstract_text)
        .bind(&p.doi)
        .bind(&p.bibtex)
        .bind(now)
        .bind(&p.id)
        .execute(self.pool)
        .await
        .context("update paper metadata")?;
        if res.rows_affected() == 0 {
            return Err(anyhow::anyhow!("paper {} not found", p.id));
        }
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
}
