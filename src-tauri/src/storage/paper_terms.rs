use anyhow::{Context, Result};
use chrono::Utc;
use sqlx::Row;

use super::db::Pool;
use super::models::{PaperTerm, RelatedPaperTerm};

pub struct NewPaperTerm {
    pub term: String,
    pub normalized_term: String,
    pub local_definition: String,
    pub local_evidence: String,
    pub score: f64,
}

pub struct PaperTermRepo<'a> {
    pool: &'a Pool,
}

impl<'a> PaperTermRepo<'a> {
    pub fn new(pool: &'a Pool) -> Self {
        Self { pool }
    }

    pub async fn list_all(&self) -> Result<Vec<PaperTerm>> {
        let rows = sqlx::query(
            "SELECT id, paper_id, term, normalized_term, local_definition, local_evidence,
                    score, created_at, updated_at
             FROM paper_terms
             ORDER BY score DESC",
        )
        .fetch_all(self.pool)
        .await
        .context("list all paper terms")?;
        rows.into_iter().map(row_to_paper_term).collect()
    }

    pub async fn list_by_paper(&self, paper_id: &str) -> Result<Vec<PaperTerm>> {
        let rows = sqlx::query(
            "SELECT id, paper_id, term, normalized_term, local_definition, local_evidence,
                    score, created_at, updated_at
             FROM paper_terms
             WHERE paper_id = ?1
             ORDER BY score DESC, term ASC",
        )
        .bind(paper_id)
        .fetch_all(self.pool)
        .await
        .context("list paper terms")?;
        rows.into_iter().map(row_to_paper_term).collect()
    }

    pub async fn replace_for_paper(
        &self,
        paper_id: &str,
        terms: &[NewPaperTerm],
    ) -> Result<Vec<PaperTerm>> {
        let mut tx = self
            .pool
            .begin()
            .await
            .context("begin replace paper terms")?;
        sqlx::query("DELETE FROM paper_terms WHERE paper_id = ?1")
            .bind(paper_id)
            .execute(&mut *tx)
            .await
            .context("delete old paper terms")?;
        let now = Utc::now().timestamp();
        for term in terms {
            sqlx::query(
                "INSERT INTO paper_terms
                 (paper_id, term, normalized_term, local_definition, local_evidence, score, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
            )
            .bind(paper_id)
            .bind(&term.term)
            .bind(&term.normalized_term)
            .bind(&term.local_definition)
            .bind(&term.local_evidence)
            .bind(term.score)
            .bind(now)
            .execute(&mut *tx)
            .await
            .context("insert paper term")?;
        }
        tx.commit().await.context("commit replace paper terms")?;
        self.list_by_paper(paper_id).await
    }

    pub async fn related_by_normalized(
        &self,
        normalized_term: &str,
        exclude_paper_id: &str,
        limit: i64,
    ) -> Result<Vec<RelatedPaperTerm>> {
        let rows = sqlx::query(
            "SELECT pt.paper_id, p.title AS paper_title, p.year AS paper_year,
                    pt.term, pt.local_definition
             FROM paper_terms pt
             JOIN papers p ON p.id = pt.paper_id
             WHERE pt.normalized_term = ?1 AND pt.paper_id != ?2
             ORDER BY pt.score DESC, p.updated_at DESC
             LIMIT ?3",
        )
        .bind(normalized_term)
        .bind(exclude_paper_id)
        .bind(limit)
        .fetch_all(self.pool)
        .await
        .context("related paper terms")?;
        rows.into_iter().map(row_to_related_term).collect()
    }

    /// Insert (or update by normalized form) a single term row. Used by the
    /// "add term from selection" flow — keeps existing auto-generated rows
    /// untouched but bumps definition/evidence/score when the user re-saves.
    pub async fn upsert_one(&self, paper_id: &str, term: &NewPaperTerm) -> Result<PaperTerm> {
        let now = Utc::now().timestamp();
        sqlx::query(
            "INSERT INTO paper_terms
             (paper_id, term, normalized_term, local_definition, local_evidence, score, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
             ON CONFLICT(paper_id, normalized_term) DO UPDATE SET
                term = excluded.term,
                local_definition = excluded.local_definition,
                local_evidence = excluded.local_evidence,
                score = MAX(paper_terms.score, excluded.score),
                updated_at = excluded.updated_at",
        )
        .bind(paper_id)
        .bind(&term.term)
        .bind(&term.normalized_term)
        .bind(&term.local_definition)
        .bind(&term.local_evidence)
        .bind(term.score)
        .bind(now)
        .execute(self.pool)
        .await
        .context("upsert paper term")?;
        let row = sqlx::query(
            "SELECT id, paper_id, term, normalized_term, local_definition, local_evidence,
                    score, created_at, updated_at
             FROM paper_terms
             WHERE paper_id = ?1 AND normalized_term = ?2",
        )
        .bind(paper_id)
        .bind(&term.normalized_term)
        .fetch_one(self.pool)
        .await
        .context("fetch upserted paper term")?;
        row_to_paper_term(row)
    }

    pub async fn update_definition(
        &self,
        paper_id: &str,
        normalized_term: &str,
        definition: &str,
    ) -> Result<()> {
        let now = Utc::now().timestamp();
        sqlx::query(
            "UPDATE paper_terms
             SET local_definition = ?1, updated_at = ?2
             WHERE paper_id = ?3 AND normalized_term = ?4",
        )
        .bind(definition)
        .bind(now)
        .bind(paper_id)
        .bind(normalized_term)
        .execute(self.pool)
        .await
        .context("update paper term definition")?;
        Ok(())
    }

    /// Delete one term row by id, scoped to a paper.
    pub async fn delete(&self, paper_id: &str, term_id: i64) -> Result<()> {
        sqlx::query("DELETE FROM paper_terms WHERE id = ?1 AND paper_id = ?2")
            .bind(term_id)
            .bind(paper_id)
            .execute(self.pool)
            .await
            .context("delete paper term")?;
        Ok(())
    }
}

fn row_to_paper_term(row: sqlx::sqlite::SqliteRow) -> Result<PaperTerm> {
    Ok(PaperTerm {
        id: row.try_get("id")?,
        paper_id: row.try_get("paper_id")?,
        term: row.try_get("term")?,
        normalized_term: row.try_get("normalized_term")?,
        local_definition: row.try_get("local_definition")?,
        local_evidence: row.try_get("local_evidence")?,
        score: row.try_get("score")?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}

fn row_to_related_term(row: sqlx::sqlite::SqliteRow) -> Result<RelatedPaperTerm> {
    Ok(RelatedPaperTerm {
        paper_id: row.try_get("paper_id")?,
        paper_title: row.try_get("paper_title")?,
        paper_year: row.try_get("paper_year").ok(),
        term: row.try_get("term")?,
        local_definition: row.try_get("local_definition")?,
    })
}
