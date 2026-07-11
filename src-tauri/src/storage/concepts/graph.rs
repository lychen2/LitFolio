use anyhow::Result;
use std::collections::HashSet;

use super::{ConceptRepo, GraphData, GraphEdge, GraphFilter, GraphNode};

impl<'a> ConceptRepo<'a> {
    /// Merge concept nodes and concept-to-concept edges into GraphData.
    pub async fn merge_into_graph(
        &self,
        graph: &mut GraphData,
        filter: &GraphFilter,
    ) -> Result<()> {
        if !filter.include_concepts.unwrap_or(true) {
            return Ok(());
        }

        let concepts = self.list_all().await?;
        let relations = self.list_relations().await?;
        let concept_ids = concept_id_set(&concepts);

        graph.nodes.extend(concepts.iter().map(|concept| GraphNode {
            id: format!("concept:{}", concept.id),
            node_type: "concept".to_string(),
            label: concept.name.clone(),
            sublabel: concept.description.clone(),
            year: None,
            read_status: None,
            paper_count: None,
        }));

        let allowed_relations = filter.relations.as_deref();
        for relation in &relations {
            if !concept_ids.contains(&relation.source_concept_id)
                || !concept_ids.contains(&relation.target_concept_id)
            {
                continue;
            }
            if allowed_relations.is_some_and(|allowed| !allowed.contains(&relation.relation)) {
                continue;
            }
            graph.edges.push(GraphEdge {
                id: format!("cr:{}", relation.id),
                source: format!("concept:{}", relation.source_concept_id),
                target: format!("concept:{}", relation.target_concept_id),
                edge_type: "concept".to_string(),
                relation: Some(relation.relation.clone()),
                source_type: "user".to_string(),
                confidence: 1.0,
                snippet: relation.snippet.clone(),
            });
        }

        self.add_paper_concept_edges(graph, &concepts).await
    }

    async fn add_paper_concept_edges(
        &self,
        graph: &mut GraphData,
        concepts: &[super::Concept],
    ) -> Result<()> {
        for concept in concepts {
            let papers = self.papers_for_concept(concept.id).await?;
            graph.edges.extend(papers.iter().map(|pc| GraphEdge {
                id: format!("pc:{}:{}", pc.paper_id, pc.concept_id),
                source: pc.paper_id.clone(),
                target: format!("concept:{}", pc.concept_id),
                edge_type: "concept".to_string(),
                relation: Some("discusses".to_string()),
                source_type: "derived".to_string(),
                confidence: pc.relevance,
                snippet: None,
            }));
        }
        Ok(())
    }
}

fn concept_id_set(concepts: &[super::Concept]) -> HashSet<i64> {
    concepts.iter().map(|concept| concept.id).collect()
}
