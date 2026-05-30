use anyhow::{Context, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::Row;
use std::collections::{HashMap, HashSet};

use super::db::Pool;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaperLink {
    pub id: i64,
    pub source_paper_id: String,
    pub target_paper_id: String,
    pub relation: String,
    pub source_type: String,
    pub confidence: f64,
    pub snippet: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct GraphNode {
    pub id: String,
    pub node_type: String,
    pub label: String,
    pub sublabel: Option<String>,
    pub year: Option<i32>,
    pub read_status: Option<String>,
    pub paper_count: Option<i32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GraphEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    pub edge_type: String,
    pub source_type: String,
    pub confidence: f64,
    pub snippet: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GraphData {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GraphFilter {
    pub relations: Option<Vec<String>>,
    pub min_confidence: Option<f64>,
    pub include_concepts: Option<bool>,
    pub paper_ids: Option<Vec<String>>,
}

pub struct PaperLinkRepo<'a> {
    pool: &'a Pool,
}

impl<'a> PaperLinkRepo<'a> {
    pub fn new(pool: &'a Pool) -> Self {
        Self { pool }
    }

    pub async fn create(
        &self,
        source_paper_id: &str,
        target_paper_id: &str,
        relation: &str,
        source_type: &str,
        confidence: f64,
        snippet: Option<&str>,
    ) -> Result<PaperLink> {
        let now = Utc::now().timestamp();
        let id = sqlx::query(
            "INSERT INTO paper_links
             (source_paper_id, target_paper_id, relation, source_type, confidence, snippet, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
        )
        .bind(source_paper_id)
        .bind(target_paper_id)
        .bind(relation)
        .bind(source_type)
        .bind(confidence)
        .bind(snippet)
        .bind(now)
        .execute(self.pool)
        .await
        .context("create paper link")?
        .last_insert_rowid();
        self.get(id).await
    }

    pub async fn create_or_get(
        &self,
        source_paper_id: &str,
        target_paper_id: &str,
        relation: &str,
        source_type: &str,
        confidence: f64,
        snippet: Option<&str>,
    ) -> Result<PaperLink> {
        if let Some(existing) = self
            .find(source_paper_id, target_paper_id, relation)
            .await?
        {
            return Ok(existing);
        }
        self.create(
            source_paper_id,
            target_paper_id,
            relation,
            source_type,
            confidence,
            snippet,
        )
        .await
    }

    async fn find(
        &self,
        source_paper_id: &str,
        target_paper_id: &str,
        relation: &str,
    ) -> Result<Option<PaperLink>> {
        let row = sqlx::query(
            "SELECT id, source_paper_id, target_paper_id, relation, source_type,
                    confidence, snippet, created_at, updated_at
             FROM paper_links
             WHERE source_paper_id = ?1 AND target_paper_id = ?2 AND relation = ?3",
        )
        .bind(source_paper_id)
        .bind(target_paper_id)
        .bind(relation)
        .fetch_optional(self.pool)
        .await
        .context("find paper link")?;
        row.map(row_to_link).transpose()
    }

    pub async fn get(&self, id: i64) -> Result<PaperLink> {
        let row = sqlx::query(
            "SELECT id, source_paper_id, target_paper_id, relation, source_type,
                    confidence, snippet, created_at, updated_at
             FROM paper_links WHERE id = ?1",
        )
        .bind(id)
        .fetch_one(self.pool)
        .await
        .context("get paper link")?;
        row_to_link(row)
    }

    pub async fn delete(&self, id: i64) -> Result<()> {
        sqlx::query("DELETE FROM paper_links WHERE id = ?1")
            .bind(id)
            .execute(self.pool)
            .await
            .context("delete paper link")?;
        Ok(())
    }

    pub async fn list_for_paper(&self, paper_id: &str) -> Result<Vec<PaperLink>> {
        let rows = sqlx::query(
            "SELECT id, source_paper_id, target_paper_id, relation, source_type,
                    confidence, snippet, created_at, updated_at
             FROM paper_links
             WHERE source_paper_id = ?1 OR target_paper_id = ?1
             ORDER BY updated_at DESC",
        )
        .bind(paper_id)
        .fetch_all(self.pool)
        .await
        .context("list links for paper")?;
        rows.into_iter().map(row_to_link).collect()
    }

    pub async fn list_all(&self) -> Result<Vec<PaperLink>> {
        let rows = sqlx::query(
            "SELECT id, source_paper_id, target_paper_id, relation, source_type,
                    confidence, snippet, created_at, updated_at
             FROM paper_links
             ORDER BY updated_at DESC",
        )
        .fetch_all(self.pool)
        .await
        .context("list all paper links")?;
        rows.into_iter().map(row_to_link).collect()
    }

    pub async fn accept_ai_link(&self, id: i64) -> Result<()> {
        let now = Utc::now().timestamp();
        sqlx::query(
            "UPDATE paper_links SET confidence = 1.0, source_type = 'user', updated_at = ?1
             WHERE id = ?2",
        )
        .bind(now)
        .bind(id)
        .execute(self.pool)
        .await
        .context("accept ai link")?;
        Ok(())
    }

    pub async fn bulk_insert_ai(
        &self,
        links: &[(String, String, String, f64, String)],
    ) -> Result<usize> {
        let mut tx = self.pool.begin().await.context("begin bulk insert")?;
        let now = Utc::now().timestamp();
        let mut count = 0usize;
        for (src, tgt, rel, conf, snip) in links {
            let res = sqlx::query(
                "INSERT OR IGNORE INTO paper_links
                 (source_paper_id, target_paper_id, relation, source_type, confidence, snippet, created_at, updated_at)
                 VALUES (?1, ?2, ?3, 'ai', ?4, ?5, ?6, ?6)",
            )
            .bind(src)
            .bind(tgt)
            .bind(rel)
            .bind(conf)
            .bind(snip)
            .bind(now)
            .execute(&mut *tx)
            .await
            .context("insert ai link")?;
            count += res.rows_affected() as usize;
        }
        tx.commit().await.context("commit bulk insert")?;
        Ok(count)
    }

    pub async fn graph_data(&self, filter: &GraphFilter) -> Result<GraphData> {
        let filtered_links = self.filtered_links(filter).await?;

        let mut paper_ids: HashSet<String> = HashSet::new();
        for link in &filtered_links {
            paper_ids.insert(link.source_paper_id.clone());
            paper_ids.insert(link.target_paper_id.clone());
        }

        let mut nodes = self.paper_nodes(&paper_ids).await?;
        let mut edges = filtered_links
            .iter()
            .map(|link| GraphEdge {
                id: format!("link:{}", link.id),
                source: link.source_paper_id.clone(),
                target: link.target_paper_id.clone(),
                edge_type: link.relation.clone(),
                source_type: link.source_type.clone(),
                confidence: link.confidence,
                snippet: link.snippet.clone(),
            })
            .collect::<Vec<_>>();

        if filter.include_concepts.unwrap_or(true) && !paper_ids.is_empty() {
            let concept_edges = self.build_concept_nodes(&paper_ids, &mut nodes).await?;
            edges.extend(concept_edges);
        }

        Ok(GraphData { nodes, edges })
    }

    async fn filtered_links(&self, filter: &GraphFilter) -> Result<Vec<PaperLink>> {
        if filter
            .relations
            .as_ref()
            .is_some_and(|relations| relations.is_empty())
            || filter
                .paper_ids
                .as_ref()
                .is_some_and(|paper_ids| paper_ids.is_empty())
        {
            return Ok(Vec::new());
        }

        let mut clauses = vec!["confidence >= ?".to_string()];
        if let Some(relations) = &filter.relations {
            let placeholders = relations.iter().map(|_| "?").collect::<Vec<_>>().join(",");
            clauses.push(format!("relation IN ({placeholders})"));
        }
        if let Some(paper_ids) = &filter.paper_ids {
            let placeholders = paper_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
            clauses.push(format!(
                "(source_paper_id IN ({placeholders}) OR target_paper_id IN ({placeholders}))"
            ));
        }

        let sql = format!(
            "SELECT id, source_paper_id, target_paper_id, relation, source_type,
                    confidence, snippet, created_at, updated_at
             FROM paper_links WHERE {} ORDER BY updated_at DESC",
            clauses.join(" AND ")
        );
        let mut query = sqlx::query(&sql).bind(filter.min_confidence.unwrap_or(0.0));
        if let Some(relations) = &filter.relations {
            for relation in relations {
                query = query.bind(relation);
            }
        }
        if let Some(paper_ids) = &filter.paper_ids {
            for paper_id in paper_ids {
                query = query.bind(paper_id);
            }
            for paper_id in paper_ids {
                query = query.bind(paper_id);
            }
        }
        let rows = query
            .fetch_all(self.pool)
            .await
            .context("query graph links")?;
        rows.into_iter().map(row_to_link).collect()
    }

    async fn paper_nodes(&self, paper_ids: &HashSet<String>) -> Result<Vec<GraphNode>> {
        if paper_ids.is_empty() {
            return Ok(Vec::new());
        }
        let placeholders = paper_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql =
            format!("SELECT id, title, year, read_status FROM papers WHERE id IN ({placeholders})");
        let mut query = sqlx::query(&sql);
        for paper_id in paper_ids {
            query = query.bind(paper_id);
        }
        let rows = query
            .fetch_all(self.pool)
            .await
            .context("query graph papers")?;
        rows.into_iter()
            .map(|row| {
                let id: String = row.try_get("id")?;
                let title: String = row.try_get("title")?;
                let year: Option<i32> = row.try_get("year").ok();
                let read_status: Option<String> = row.try_get("read_status").ok();
                Ok(GraphNode {
                    id,
                    node_type: "paper".into(),
                    label: title,
                    sublabel: year.map(|y| y.to_string()),
                    year,
                    read_status,
                    paper_count: None,
                })
            })
            .collect()
    }

    async fn build_concept_nodes(
        &self,
        paper_ids: &HashSet<String>,
        nodes: &mut Vec<GraphNode>,
    ) -> Result<Vec<GraphEdge>> {
        // Find normalized_terms that appear in 2+ of the graph's papers
        let placeholders: String = paper_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!(
            "SELECT normalized_term, COUNT(DISTINCT paper_id) AS cnt
             FROM paper_terms
             WHERE paper_id IN ({})
             GROUP BY normalized_term
             HAVING cnt >= 2
             ORDER BY cnt DESC
             LIMIT 50",
            placeholders
        );
        let mut query = sqlx::query(&sql);
        for pid in paper_ids {
            query = query.bind(pid);
        }
        let concept_rows = query.fetch_all(self.pool).await.context("query concepts")?;
        let mut concepts = Vec::new();
        for row in concept_rows {
            concepts.push((
                row.try_get::<String, _>("normalized_term")?,
                row.try_get::<i32, _>("cnt")?,
            ));
        }
        if concepts.is_empty() {
            return Ok(Vec::new());
        }

        let terms = concepts
            .iter()
            .map(|(term, _)| term.clone())
            .collect::<Vec<_>>();
        let definitions = self.concept_definitions(&terms).await?;
        for (term, cnt) in &concepts {
            nodes.push(GraphNode {
                id: format!("concept:{}", term),
                node_type: "concept".into(),
                label: term.clone(),
                sublabel: definitions.get(term).cloned().flatten(),
                year: None,
                read_status: None,
                paper_count: Some(*cnt),
            });
        }

        self.concept_edges(paper_ids, &terms).await
    }

    async fn concept_definitions(
        &self,
        terms: &[String],
    ) -> Result<HashMap<String, Option<String>>> {
        if terms.is_empty() {
            return Ok(HashMap::new());
        }
        let placeholders = terms.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!(
            "SELECT normalized_term, MIN(local_definition) AS local_definition
             FROM paper_terms
             WHERE normalized_term IN ({placeholders}) AND local_definition IS NOT NULL
             GROUP BY normalized_term"
        );
        let mut query = sqlx::query(&sql);
        for term in terms {
            query = query.bind(term);
        }
        let rows = query
            .fetch_all(self.pool)
            .await
            .context("query concept definitions")?;
        let mut definitions = terms
            .iter()
            .map(|term| (term.clone(), None))
            .collect::<HashMap<_, _>>();
        for row in rows {
            definitions.insert(
                row.try_get("normalized_term")?,
                row.try_get("local_definition").ok(),
            );
        }
        Ok(definitions)
    }

    async fn concept_edges(
        &self,
        paper_ids: &HashSet<String>,
        terms: &[String],
    ) -> Result<Vec<GraphEdge>> {
        if paper_ids.is_empty() || terms.is_empty() {
            return Ok(Vec::new());
        }
        let paper_placeholders = paper_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let term_placeholders = terms.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!(
            "SELECT paper_id, normalized_term
             FROM paper_terms
             WHERE paper_id IN ({paper_placeholders})
               AND normalized_term IN ({term_placeholders})"
        );
        let mut query = sqlx::query(&sql);
        for paper_id in paper_ids {
            query = query.bind(paper_id);
        }
        for term in terms {
            query = query.bind(term);
        }
        let rows = query
            .fetch_all(self.pool)
            .await
            .context("query concept edges")?;
        rows.into_iter()
            .map(|row| {
                let paper_id: String = row.try_get("paper_id")?;
                let term: String = row.try_get("normalized_term")?;
                Ok(GraphEdge {
                    id: format!("term:{}:{}", paper_id, term),
                    source: paper_id,
                    target: format!("concept:{}", term),
                    edge_type: "has_concept".into(),
                    source_type: "derived".into(),
                    confidence: 1.0,
                    snippet: None,
                })
            })
            .collect()
    }
}

fn row_to_link(row: sqlx::sqlite::SqliteRow) -> Result<PaperLink> {
    Ok(PaperLink {
        id: row.try_get("id")?,
        source_paper_id: row.try_get("source_paper_id")?,
        target_paper_id: row.try_get("target_paper_id")?,
        relation: row.try_get("relation")?,
        source_type: row.try_get("source_type")?,
        confidence: row.try_get("confidence")?,
        snippet: row.try_get("snippet")?,
        created_at: row.try_get("created_at")?,
        updated_at: row.try_get("updated_at")?,
    })
}
