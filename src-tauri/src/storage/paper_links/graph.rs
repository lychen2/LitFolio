use anyhow::{Context, Result};
use sqlx::Row;
use std::collections::{HashMap, HashSet};

use super::types::{GraphData, GraphEdge, GraphFilter, GraphNode};
use super::{row_to_link, PaperLink, PaperLinkRepo};

impl<'a> PaperLinkRepo<'a> {
    pub async fn graph_data(&self, filter: &GraphFilter) -> Result<GraphData> {
        let filtered_links = self.filtered_links(filter).await?;
        let paper_ids = graph_paper_ids(&filtered_links);
        let mut nodes = self.paper_nodes(&paper_ids).await?;
        let mut edges = link_edges(&filtered_links);

        if filter.include_concepts.unwrap_or(true) && !paper_ids.is_empty() {
            let concept_edges = self.build_concept_nodes(&paper_ids, &mut nodes).await?;
            edges.extend(concept_edges);
        }
        Ok(GraphData { nodes, edges })
    }

    async fn filtered_links(&self, filter: &GraphFilter) -> Result<Vec<PaperLink>> {
        if empty_graph_filter(filter) {
            return Ok(Vec::new());
        }
        let clauses = graph_filter_clauses(filter);
        let sql = format!(
            "SELECT id, source_paper_id, target_paper_id, relation, source_type,
                    confidence, snippet, created_at, updated_at
             FROM paper_links WHERE {} ORDER BY updated_at DESC",
            clauses.join(" AND ")
        );
        let rows = bind_graph_filter(sqlx::query(&sql), filter)
            .fetch_all(self.pool)
            .await
            .context("query graph links")?;
        rows.into_iter().map(row_to_link).collect()
    }

    async fn paper_nodes(&self, paper_ids: &HashSet<String>) -> Result<Vec<GraphNode>> {
        if paper_ids.is_empty() {
            return Ok(Vec::new());
        }
        let placeholders = placeholders(paper_ids.len());
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
        rows.into_iter().map(row_to_node).collect()
    }

    async fn build_concept_nodes(
        &self,
        paper_ids: &HashSet<String>,
        nodes: &mut Vec<GraphNode>,
    ) -> Result<Vec<GraphEdge>> {
        let concepts = self.concepts_for_graph(paper_ids).await?;
        if concepts.is_empty() {
            return Ok(Vec::new());
        }
        let terms = concepts
            .iter()
            .map(|(term, _)| term.clone())
            .collect::<Vec<_>>();
        let definitions = self.concept_definitions(&terms).await?;
        nodes.extend(
            concepts
                .iter()
                .map(|(term, count)| concept_node(term, *count, &definitions)),
        );
        self.concept_edges(paper_ids, &terms).await
    }

    async fn concepts_for_graph(&self, paper_ids: &HashSet<String>) -> Result<Vec<(String, i32)>> {
        let placeholders = placeholders(paper_ids.len());
        let sql = format!(
            "SELECT normalized_term, COUNT(DISTINCT paper_id) AS cnt
             FROM paper_terms
             WHERE paper_id IN ({placeholders})
             GROUP BY normalized_term
             HAVING cnt >= 2
             ORDER BY cnt DESC
             LIMIT 50",
        );
        let mut query = sqlx::query(&sql);
        for paper_id in paper_ids {
            query = query.bind(paper_id);
        }
        let rows = query.fetch_all(self.pool).await.context("query concepts")?;
        rows.into_iter()
            .map(|row| Ok((row.try_get("normalized_term")?, row.try_get("cnt")?)))
            .collect()
    }

    async fn concept_definitions(
        &self,
        terms: &[String],
    ) -> Result<HashMap<String, Option<String>>> {
        if terms.is_empty() {
            return Ok(HashMap::new());
        }
        let sql = format!(
            "SELECT normalized_term, MIN(local_definition) AS local_definition
             FROM paper_terms
             WHERE normalized_term IN ({}) AND local_definition IS NOT NULL
             GROUP BY normalized_term",
            placeholders(terms.len())
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
        let sql = format!(
            "SELECT paper_id, normalized_term
             FROM paper_terms
             WHERE paper_id IN ({}) AND normalized_term IN ({})",
            placeholders(paper_ids.len()),
            placeholders(terms.len())
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
        rows.into_iter().map(row_to_concept_edge).collect()
    }
}

fn empty_graph_filter(filter: &GraphFilter) -> bool {
    filter
        .relations
        .as_ref()
        .is_some_and(|relations| relations.is_empty())
        || filter
            .paper_ids
            .as_ref()
            .is_some_and(|paper_ids| paper_ids.is_empty())
}

fn graph_filter_clauses(filter: &GraphFilter) -> Vec<String> {
    let mut clauses = vec!["confidence >= ?".to_string()];
    if let Some(relations) = &filter.relations {
        clauses.push(format!("relation IN ({})", placeholders(relations.len())));
    }
    if let Some(paper_ids) = &filter.paper_ids {
        let ids = placeholders(paper_ids.len());
        clauses.push(format!(
            "(source_paper_id IN ({ids}) OR target_paper_id IN ({ids}))"
        ));
    }
    clauses
}

fn bind_graph_filter<'q>(
    mut query: sqlx::query::Query<'q, sqlx::Sqlite, sqlx::sqlite::SqliteArguments<'q>>,
    filter: &'q GraphFilter,
) -> sqlx::query::Query<'q, sqlx::Sqlite, sqlx::sqlite::SqliteArguments<'q>> {
    query = query.bind(filter.min_confidence.unwrap_or(0.0));
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
    query
}

fn graph_paper_ids(links: &[PaperLink]) -> HashSet<String> {
    let mut paper_ids = HashSet::new();
    for link in links {
        paper_ids.insert(link.source_paper_id.clone());
        paper_ids.insert(link.target_paper_id.clone());
    }
    paper_ids
}

fn link_edges(links: &[PaperLink]) -> Vec<GraphEdge> {
    links
        .iter()
        .map(|link| GraphEdge {
            id: format!("link:{}", link.id),
            source: link.source_paper_id.clone(),
            target: link.target_paper_id.clone(),
            edge_type: paper_link_edge_type(link).into(),
            relation: Some(link.relation.clone()),
            source_type: link.source_type.clone(),
            confidence: link.confidence,
            snippet: link.snippet.clone(),
        })
        .collect()
}

fn concept_node(
    term: &str,
    count: i32,
    definitions: &HashMap<String, Option<String>>,
) -> GraphNode {
    GraphNode {
        id: format!("concept:{term}"),
        node_type: "concept".into(),
        label: term.into(),
        sublabel: definitions.get(term).cloned().flatten(),
        year: None,
        read_status: None,
        paper_count: Some(count),
    }
}

fn row_to_node(row: sqlx::sqlite::SqliteRow) -> Result<GraphNode> {
    let year: Option<i32> = row.try_get("year").ok();
    Ok(GraphNode {
        id: row.try_get("id")?,
        node_type: "paper".into(),
        label: row.try_get("title")?,
        sublabel: year.map(|y| y.to_string()),
        year,
        read_status: row.try_get("read_status").ok(),
        paper_count: None,
    })
}

fn row_to_concept_edge(row: sqlx::sqlite::SqliteRow) -> Result<GraphEdge> {
    let paper_id: String = row.try_get("paper_id")?;
    let term: String = row.try_get("normalized_term")?;
    Ok(GraphEdge {
        id: format!("term:{paper_id}:{term}"),
        source: paper_id,
        target: format!("concept:{term}"),
        edge_type: "concept".into(),
        relation: Some("has_concept".into()),
        source_type: "derived".into(),
        confidence: 1.0,
        snippet: None,
    })
}

fn paper_link_edge_type(link: &PaperLink) -> &'static str {
    match link.source_type.as_str() {
        "user" => "manual",
        "ai" => "similar",
        _ => "manual",
    }
}

fn placeholders(count: usize) -> String {
    vec!["?"; count].join(",")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn link_edges_keep_relation_while_normalizing_edge_type() {
        let edges = link_edges(&[
            paper_link(1, "user", "builds_on"),
            paper_link(2, "ai", "related"),
        ]);

        assert_eq!(edges[0].edge_type, "manual");
        assert_eq!(edges[0].relation.as_deref(), Some("builds_on"));
        assert_eq!(edges[1].edge_type, "similar");
        assert_eq!(edges[1].relation.as_deref(), Some("related"));
    }

    fn paper_link(id: i64, source_type: &str, relation: &str) -> PaperLink {
        PaperLink {
            id,
            source_paper_id: format!("p{id}"),
            target_paper_id: format!("p{}", id + 1),
            relation: relation.into(),
            source_type: source_type.into(),
            confidence: 1.0,
            snippet: None,
            created_at: 0,
            updated_at: 0,
        }
    }
}
