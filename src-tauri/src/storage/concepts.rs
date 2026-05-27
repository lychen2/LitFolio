//! Cross-paper concepts and their typed relationships.

use anyhow::{Context, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::Row;

use super::db::Pool;
use super::paper_links::{GraphData, GraphEdge, GraphFilter, GraphNode};

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
        Ok(row.map(|r| row_to_concept(&r)))
    }

    pub async fn find_by_name(&self, name: &str) -> Result<Option<Concept>> {
        let row = sqlx::query(
            "SELECT id, name, description, source, created_at FROM concepts WHERE name = ?1",
        )
        .bind(name)
        .fetch_optional(self.pool)
        .await
        .context("find concept by name")?;
        Ok(row.map(|r| row_to_concept(&r)))
    }

    pub async fn list_all(&self) -> Result<Vec<Concept>> {
        let rows = sqlx::query(
            "SELECT id, name, description, source, created_at FROM concepts ORDER BY name",
        )
        .fetch_all(self.pool)
        .await
        .context("list concepts")?;
        Ok(rows.iter().map(|r| row_to_concept(r)).collect())
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
        Ok(rows.iter().map(|r| row_to_relation(r)).collect())
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

    pub async fn link_paper(
        &self,
        paper_id: &str,
        concept_id: i64,
        relevance: f64,
    ) -> Result<()> {
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
        Ok(rows
            .iter()
            .map(|r| PaperConcept {
                paper_id: r.try_get("paper_id").unwrap_or_default(),
                concept_id: r.try_get("concept_id").unwrap_or(0),
                concept_name: r.try_get("concept_name").unwrap_or_default(),
                relevance: r.try_get("relevance").unwrap_or(1.0),
            })
            .collect())
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
        Ok(rows
            .iter()
            .map(|r| PaperConcept {
                paper_id: r.try_get("paper_id").unwrap_or_default(),
                concept_id: r.try_get("concept_id").unwrap_or(0),
                concept_name: r.try_get("concept_name").unwrap_or_default(),
                relevance: r.try_get("relevance").unwrap_or(1.0),
            })
            .collect())
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

    // ── Graph Integration ───────────────────────────────────────────────

    /// Merge concept nodes and concept-to-concept edges into GraphData.
    pub async fn merge_into_graph(&self, graph: &mut GraphData, filter: &GraphFilter) -> Result<()> {
        if !filter.include_concepts.unwrap_or(true) {
            return Ok(());
        }

        let concepts = self.list_all().await?;
        let relations = self.list_relations().await?;

        // Add concept nodes
        let mut concept_ids = std::collections::HashSet::new();
        for c in &concepts {
            concept_ids.insert(c.id);
            graph.nodes.push(GraphNode {
                id: format!("concept:{}", c.id),
                node_type: "concept".to_string(),
                label: c.name.clone(),
                sublabel: c.description.clone(),
                year: None,
                read_status: None,
                paper_count: None,
            });
        }

        // Add concept-to-concept edges
        let relations_filter = filter.relations.as_deref();
        for r in &relations {
            if !concept_ids.contains(&r.source_concept_id) || !concept_ids.contains(&r.target_concept_id) {
                continue;
            }
            if let Some(allowed) = relations_filter {
                if !allowed.contains(&r.relation) {
                    continue;
                }
            }
            graph.edges.push(GraphEdge {
                id: format!("cr:{}", r.id),
                source: format!("concept:{}", r.source_concept_id),
                target: format!("concept:{}", r.target_concept_id),
                edge_type: r.relation.clone(),
                source_type: "user".to_string(),
                confidence: 1.0,
                snippet: r.snippet.clone(),
            });
        }

        // Add paper-to-concept edges
        for c in &concepts {
            let papers = self.papers_for_concept(c.id).await?;
            for pc in &papers {
                graph.edges.push(GraphEdge {
                    id: format!("pc:{}:{}", pc.paper_id, pc.concept_id),
                    source: pc.paper_id.clone(),
                    target: format!("concept:{}", pc.concept_id),
                    edge_type: "discusses".to_string(),
                    source_type: "derived".to_string(),
                    confidence: pc.relevance,
                    snippet: None,
                });
            }
        }

        Ok(())
    }
}

fn row_to_concept(r: &sqlx::sqlite::SqliteRow) -> Concept {
    Concept {
        id: r.try_get("id").unwrap_or(0),
        name: r.try_get("name").unwrap_or_default(),
        description: r.try_get("description").unwrap_or(None),
        source: r.try_get("source").unwrap_or_else(|_| "ai".into()),
        created_at: r.try_get("created_at").unwrap_or(0),
    }
}

fn row_to_relation(r: &sqlx::sqlite::SqliteRow) -> ConceptRelation {
    ConceptRelation {
        id: r.try_get("id").unwrap_or(0),
        source_concept_id: r.try_get("source_concept_id").unwrap_or(0),
        target_concept_id: r.try_get("target_concept_id").unwrap_or(0),
        relation: r.try_get("relation").unwrap_or_default(),
        evidence_paper_id: r.try_get("evidence_paper_id").unwrap_or(None),
        snippet: r.try_get("snippet").unwrap_or(None),
        created_at: r.try_get("created_at").unwrap_or(0),
    }
}
