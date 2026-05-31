//! Cross-paper concepts and their typed relationships.

use anyhow::{Context, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};

use super::db::Pool;
use super::paper_links::{GraphData, GraphEdge, GraphFilter, GraphNode};

mod graph;
mod rows;

use rows::{row_to_concept, row_to_paper_concept, row_to_relation};

/// A reusable concept extracted across papers.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Concept {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub source: String,
    pub created_at: i64,
}

/// A typed relation between two concepts.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConceptRelation {
    pub id: i64,
    pub source_concept_id: i64,
    pub target_concept_id: i64,
    pub relation: String,
    pub evidence_paper_id: Option<String>,
    pub snippet: Option<String>,
    pub created_at: i64,
}

/// A concept linked to a paper with relevance score.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaperConcept {
    pub paper_id: String,
    pub concept_id: i64,
    pub concept_name: String,
    pub relevance: f64,
}

pub struct ConceptRepo<'a> {
    pool: &'a Pool,
}

impl<'a> ConceptRepo<'a> {
    pub fn new(pool: &'a Pool) -> Self {
        Self { pool }
    }

    // ── Concept CRUD ────────────────────────────────────────────────────

    pub async fn create(&self, name: &str, description: Option<&str>, source: &str) -> Result<i64> {
        let now = Utc::now().timestamp();
        let id = sqlx::query(
            "INSERT INTO concepts (name, description, source, created_at) VALUES (?1, ?2, ?3, ?4)",
        )
        .bind(name)
        .bind(description)
        .bind(source)
        .bind(now)
        .execute(self.pool)
        .await
        .context("create concept")?
        .last_insert_rowid();
        Ok(id)
    }

    pub async fn get(&self, id: i64) -> Result<Option<Concept>> {
        let row = sqlx::query(
            "SELECT id, name, description, source, created_at FROM concepts WHERE id = ?1",
        )
        .bind(id)
        .fetch_optional(self.pool)
        .await
        .context("get concept")?;
        row.as_ref().map(row_to_concept).transpose()
    }

    pub async fn find_by_name(&self, name: &str) -> Result<Option<Concept>> {
        let row = sqlx::query(
            "SELECT id, name, description, source, created_at FROM concepts WHERE name = ?1",
        )
        .bind(name)
        .fetch_optional(self.pool)
        .await
        .context("find concept by name")?;
        row.as_ref().map(row_to_concept).transpose()
    }

    pub async fn list_all(&self) -> Result<Vec<Concept>> {
        let rows = sqlx::query(
            "SELECT id, name, description, source, created_at FROM concepts ORDER BY name",
        )
        .fetch_all(self.pool)
        .await
        .context("list concepts")?;
        rows.iter().map(row_to_concept).collect()
    }

    pub async fn delete(&self, id: i64) -> Result<()> {
        sqlx::query("DELETE FROM concepts WHERE id = ?1")
            .bind(id)
            .execute(self.pool)
            .await
            .context("delete concept")?;
        Ok(())
    }

    // ── Concept Relations ───────────────────────────────────────────────

    pub async fn create_relation(
        &self,
        source_id: i64,
        target_id: i64,
        relation: &str,
        evidence_paper_id: Option<&str>,
        snippet: Option<&str>,
    ) -> Result<i64> {
        let now = Utc::now().timestamp();
        let id = sqlx::query(
            "INSERT INTO concept_relations (source_concept_id, target_concept_id, relation, evidence_paper_id, snippet, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        )
        .bind(source_id)
        .bind(target_id)
        .bind(relation)
        .bind(evidence_paper_id)
        .bind(snippet)
        .bind(now)
        .execute(self.pool)
        .await
        .context("create concept relation")?
        .last_insert_rowid();
        Ok(id)
    }

    pub async fn list_relations(&self) -> Result<Vec<ConceptRelation>> {
        let rows = sqlx::query(
            "SELECT id, source_concept_id, target_concept_id, relation, evidence_paper_id, snippet, created_at
             FROM concept_relations",
        )
        .fetch_all(self.pool)
        .await
        .context("list concept relations")?;
        rows.iter().map(row_to_relation).collect()
    }

    pub async fn delete_relation(&self, id: i64) -> Result<()> {
        sqlx::query("DELETE FROM concept_relations WHERE id = ?1")
            .bind(id)
            .execute(self.pool)
            .await
            .context("delete concept relation")?;
        Ok(())
    }

    // ── Paper-Concept Links ─────────────────────────────────────────────

    pub async fn link_paper(&self, paper_id: &str, concept_id: i64, relevance: f64) -> Result<()> {
        sqlx::query(
            "INSERT OR REPLACE INTO paper_concepts (paper_id, concept_id, relevance) VALUES (?1, ?2, ?3)",
        )
        .bind(paper_id)
        .bind(concept_id)
        .bind(relevance)
        .execute(self.pool)
        .await
        .context("link paper concept")?;
        Ok(())
    }

    pub async fn concepts_for_paper(&self, paper_id: &str) -> Result<Vec<PaperConcept>> {
        let rows = sqlx::query(
            "SELECT pc.paper_id, pc.concept_id, c.name as concept_name, pc.relevance
             FROM paper_concepts pc JOIN concepts c ON c.id = pc.concept_id
             WHERE pc.paper_id = ?1 ORDER BY pc.relevance DESC",
        )
        .bind(paper_id)
        .fetch_all(self.pool)
        .await
        .context("concepts for paper")?;
        rows.iter().map(row_to_paper_concept).collect()
    }

    pub async fn papers_for_concept(&self, concept_id: i64) -> Result<Vec<PaperConcept>> {
        let rows = sqlx::query(
            "SELECT pc.paper_id, pc.concept_id, c.name as concept_name, pc.relevance
             FROM paper_concepts pc JOIN concepts c ON c.id = pc.concept_id
             WHERE pc.concept_id = ?1 ORDER BY pc.relevance DESC",
        )
        .bind(concept_id)
        .fetch_all(self.pool)
        .await
        .context("papers for concept")?;
        rows.iter().map(row_to_paper_concept).collect()
    }

    pub async fn unlink_paper(&self, paper_id: &str, concept_id: i64) -> Result<()> {
        sqlx::query("DELETE FROM paper_concepts WHERE paper_id = ?1 AND concept_id = ?2")
            .bind(paper_id)
            .bind(concept_id)
            .execute(self.pool)
            .await
            .context("unlink paper concept")?;
        Ok(())
    }
}
