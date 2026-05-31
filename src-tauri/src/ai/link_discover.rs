//! AI-powered discovery of implicit paper-to-paper relationships.

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::client::{chat_complete, ChatMessage};
use super::profile::LlmProfile;
use crate::storage::Paper;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveredLink {
    pub source_paper_id: String,
    pub target_paper_id: String,
    pub relation: String,
    pub confidence: f64,
    pub snippet: String,
}

const SYSTEM_PROMPT: &str = r#"You are an academic research assistant. Your task is to identify meaningful relationships between papers in a researcher's library.

Output ONLY valid JSON: an array of relationship objects.

Each object must have:
- source_id: the paper ID that is the source of the relationship
- target_id: the paper ID that is the target
- relation: one of "extends", "contradicts", "compares", "builds_on", "uses_method", "related"
- confidence: a number from 0.0 to 1.0
- explanation: one sentence explaining the relationship

Rules:
- Only identify relationships you can support with evidence from titles, abstracts, methods, or key findings.
- "extends" = source builds directly upon target's contribution
- "contradicts" = source challenges or refutes target's claims
- "compares" = source explicitly benchmarks against target
- "builds_on" = source uses target as foundation (weaker than extends)
- "uses_method" = source adopts target's methodology
- "related" = topical overlap without a stronger relationship
- Prefer specific relations over "related" when evidence supports it
- Set confidence below 0.5 only if the connection is speculative"#;

const MAX_BATCH: usize = 12;

pub async fn discover_links(
    http: &reqwest::Client,
    profile: &LlmProfile,
    papers: &[Paper],
    existing_terms: &HashMap<String, Vec<String>>,
) -> Result<Vec<DiscoveredLink>> {
    let batches = build_batches(papers, existing_terms);
    let mut all_links = Vec::new();

    for batch in batches {
        let user_prompt = build_prompt(&batch, existing_terms);
        let messages = vec![
            ChatMessage {
                role: "system".into(),
                content: SYSTEM_PROMPT.into(),
            },
            ChatMessage {
                role: "user".into(),
                content: user_prompt,
            },
        ];
        let response = chat_complete(http, profile, &messages).await?;
        let parsed = parse_discovered_links(&response.content, &batch);
        all_links.extend(parsed);
    }

    Ok(all_links)
}

fn build_batches(papers: &[Paper], term_map: &HashMap<String, Vec<String>>) -> Vec<Vec<Paper>> {
    if papers.len() <= MAX_BATCH {
        return vec![papers.to_vec()];
    }

    // Group papers by shared terms
    let mut clusters: Vec<Vec<Paper>> = Vec::new();
    let mut assigned = std::collections::HashSet::new();

    for pids in term_map.values() {
        if pids.len() < 2 {
            continue;
        }
        let cluster: Vec<Paper> = papers
            .iter()
            .filter(|p| pids.contains(&p.id) && !assigned.contains(&p.id))
            .cloned()
            .collect();
        if cluster.len() >= 2 {
            for p in &cluster {
                assigned.insert(p.id.clone());
            }
            clusters.push(cluster);
        }
    }

    // Remaining papers grouped by year proximity
    let remaining: Vec<Paper> = papers
        .iter()
        .filter(|p| !assigned.contains(&p.id))
        .cloned()
        .collect();
    let mut sorted = remaining;
    sorted.sort_by_key(|p| p.year.unwrap_or(0));
    for chunk in sorted.chunks(MAX_BATCH) {
        clusters.push(chunk.to_vec());
    }

    // Merge small clusters
    let mut merged = Vec::new();
    let mut current = Vec::new();
    for cluster in clusters {
        if current.len() + cluster.len() > MAX_BATCH && !current.is_empty() {
            merged.push(std::mem::take(&mut current));
        }
        current.extend(cluster);
    }
    if !current.is_empty() {
        merged.push(current);
    }

    merged
}

fn build_prompt(papers: &[Paper], term_map: &HashMap<String, Vec<String>>) -> String {
    let mut lines = vec![
        "Analyze these papers for relationships. Shared terms between papers are listed after."
            .to_string(),
        String::new(),
    ];

    for (i, p) in papers.iter().enumerate() {
        lines.push(format!(
            "[{}] {} - \"{}\" ({})",
            i + 1,
            p.id,
            p.title,
            p.year.map(|y| y.to_string()).unwrap_or_else(|| "?".into())
        ));
        if let Some(tldr) = &p.tldr {
            lines.push(format!("    TL;DR: {}", truncate(tldr, 200)));
        }
        if let Some(method) = &p.method {
            lines.push(format!("    Method: {}", truncate(method, 150)));
        }
        if !p.key_findings.is_empty() {
            lines.push(format!("    Findings: {}", p.key_findings.join("; ")));
        }
        lines.push(String::new());
    }

    // Shared concepts
    let paper_ids: Vec<&str> = papers.iter().map(|p| p.id.as_str()).collect();
    let mut shared = Vec::new();
    for (term, pids) in term_map {
        let matching: Vec<usize> = pids
            .iter()
            .filter_map(|pid| paper_ids.iter().position(|&x| x == pid.as_str()))
            .collect();
        if matching.len() >= 2 {
            let indices: Vec<String> = matching.iter().map(|i| (i + 1).to_string()).collect();
            shared.push(format!(
                "- \"{}\" appears in papers [{}]",
                term,
                indices.join(", ")
            ));
        }
    }
    if !shared.is_empty() {
        lines.push("Shared concepts:".to_string());
        lines.extend(shared);
        lines.push(String::new());
    }

    lines.push(
        "Return a JSON array of relationships. Focus on substantive intellectual connections."
            .to_string(),
    );
    lines.join("\n")
}

fn parse_discovered_links(json_str: &str, batch: &[Paper]) -> Vec<DiscoveredLink> {
    let valid_ids: std::collections::HashSet<&str> = batch.iter().map(|p| p.id.as_str()).collect();

    // Try to extract JSON array from the response
    let json_start = json_str.find('[').unwrap_or(0);
    let json_end = json_str.rfind(']').map(|i| i + 1).unwrap_or(json_str.len());
    let json_slice = &json_str[json_start..json_end];

    let parsed: serde_json::Value = match serde_json::from_str(json_slice) {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };

    let arr = match parsed.as_array() {
        Some(a) => a,
        None => return Vec::new(),
    };

    let mut links = Vec::new();
    for item in arr {
        let src = item.get("source_id").and_then(|v| v.as_str()).unwrap_or("");
        let tgt = item.get("target_id").and_then(|v| v.as_str()).unwrap_or("");
        let rel = item
            .get("relation")
            .and_then(|v| v.as_str())
            .unwrap_or("related");
        let conf = item
            .get("confidence")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.5);
        let expl = item
            .get("explanation")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        if valid_ids.contains(src)
            && valid_ids.contains(tgt)
            && src != tgt
            && is_valid_relation(rel)
        {
            links.push(DiscoveredLink {
                source_paper_id: src.to_string(),
                target_paper_id: tgt.to_string(),
                relation: rel.to_string(),
                confidence: conf.clamp(0.0, 1.0),
                snippet: expl.to_string(),
            });
        }
    }
    links
}

fn is_valid_relation(s: &str) -> bool {
    matches!(
        s,
        "extends" | "contradicts" | "compares" | "builds_on" | "uses_method" | "related"
    )
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        format!("{}...", &s[..max])
    }
}
