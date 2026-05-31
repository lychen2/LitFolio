use serde::{Deserialize, Serialize};

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
