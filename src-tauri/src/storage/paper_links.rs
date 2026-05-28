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
        // 1. Build WHERE clauses for paper_links
        let min_conf = filter.min_confidence.unwrap_or(0.0);
        let links = self.list_all().await?;
        let filtered_links: Vec<PaperLink> = links
            .into_iter()
            .filter(|l| {
                l.confidence >= min_conf
                    && filter
                        .relations
                        .as_ref()
                        .map(|rs| rs.contains(&l.relation))
                        .unwrap_or(true)
                    && filter
                        .paper_ids
                        .as_ref()
                        .map(|pids| {
                            pids.contains(&l.source_paper_id) || pids.contains(&l.target_paper_id)
                        })
                        .unwrap_or(true)
            })
            .collect();

        // 2. Collect all paper IDs referenced in links
        let mut paper_ids: HashSet<String> = HashSet::new();
        for l in &filtered_links {
            paper_ids.insert(l.source_paper_id.clone());
            paper_ids.insert(l.target_paper_id.clone());
        }

        // 3. Query paper metadata
        let mut nodes = Vec::new();
        let mut edges = Vec::new();
        let mut paper_meta: HashMap<String, (String, Option<i32>, Option<String>)> = HashMap::new();

        for pid in &paper_ids {
            if let Ok(row) = sqlx::query(
                "SELECT id, title, year, read_status FROM papers WHERE id = ?1",
            )
            .bind(pid)
            .fetch_one(self.pool)
            .await
            {
                let title: String = row.try_get("title")?;
                let year: Option<i32> = row.try_get("year").ok();
                let rs: Option<String> = row.try_get("read_status").ok();
                paper_meta.insert(pid.clone(), (title.clone(), year, rs.clone()));
                nodes.push(GraphNode {
                    id: pid.clone(),
                    node_type: "paper".into(),
                    label: title,
                    sublabel: year.map(|y| y.to_string()),
                    year,
                    read_status: rs,
                    paper_count: None,
                });
            }
        }

        // 4. Build edges from paper_links
        for l in &filtered_links {
            edges.push(GraphEdge {
                id: format!("link:{}", l.id),
                source: l.source_paper_id.clone(),
                target: l.target_paper_id.clone(),
                edge_type: l.relation.clone(),
                source_type: l.source_type.clone(),
                confidence: l.confidence,
                snippet: l.snippet.clone(),
            });
        }

        // 5. Add concept nodes from paper_terms (if requested)
        if filter.include_concepts.unwrap_or(true) && !paper_ids.is_empty() {
            let concept_edges = self.build_concept_nodes(&paper_ids, &mut nodes).await?;
            edges.extend(concept_edges);
        }

        Ok(GraphData { nodes, edges })
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

        let mut edges = Vec::new();
        for row in concept_rows {
            let term: String = row.try_get("normalized_term")?;
            let cnt: i32 = row.try_get("cnt")?;
            let concept_id = format!("concept:{}", term);

            // Get a display definition from the first paper that has this term
            let def_row = sqlx::query(
                "SELECT local_definition FROM paper_terms
                 WHERE normalized_term = ?1 LIMIT 1",
            )
            .bind(&term)
            .fetch_optional(self.pool)
            .await?;
            let definition: Option<String> =
                def_row.and_then(|r| r.try_get("local_definition").ok());

            nodes.push(GraphNode {
                id: concept_id.clone(),
                node_type: "concept".into(),
                label: term.clone(),
                sublabel: definition,
                year: None,
                read_status: None,
                paper_count: Some(cnt),
            });

            // Create edges from papers to this concept
            let term_papers = sqlx::query(
                "SELECT paper_id FROM paper_terms WHERE normalized_term = ?1",
            )
            .bind(&term)
            .fetch_all(self.pool)
            .await?;
            for tr in term_papers {
                let pid: String = tr.try_get("paper_id")?;
                if paper_ids.contains(&pid) {
                    edges.push(GraphEdge {
                        id: format!("term:{}:{}", pid, term),
                        source: pid,
                        target: concept_id.clone(),
                        edge_type: "has_concept".into(),
                        source_type: "derived".into(),
                        confidence: 1.0,
                        snippet: None,
                    });
                }
            }
        }
        Ok(edges)
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
