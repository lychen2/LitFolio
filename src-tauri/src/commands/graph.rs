use std::sync::Arc;
use std::time::Instant;

use anyhow::Result;
use tauri::{AppHandle, State};
use tracing::Instrument;

use super::events::emit_or_warn;
use crate::ai::{active_profile_for_task, load_config, TaskKind};
use crate::storage::{GraphData, GraphFilter, PaperLink, PaperLinkRepo, PaperRepo, PaperTermRepo};
use crate::AppState;

#[derive(serde::Serialize)]
pub struct LinkBatchSummary {
    pub total: usize,
    pub created: usize,
    pub skipped: usize,
}

// ─── Graph data ───────────────────────────────────────────────────────────

#[tauri::command]
pub async fn graph_data(
    state: State<'_, Arc<AppState>>,
    filter: GraphFilter,
) -> Result<GraphData, String> {
    let started = Instant::now();
    let include_concepts = filter.include_concepts.unwrap_or(true);
    let relation_count = filter.relations.as_ref().map(Vec::len).unwrap_or(0);
    let paper_id_count = filter.paper_ids.as_ref().map(Vec::len).unwrap_or(0);
    let min_confidence = filter.min_confidence.unwrap_or(0.0);
    let result = PaperLinkRepo::new(&state.pool)
        .graph_data(&filter)
        .instrument(tracing::info_span!(
            "graph_data",
            include_concepts,
            relation_count,
            paper_id_count,
            min_confidence
        ))
        .await
        .map_err(|e| e.to_string());
    match &result {
        Ok(graph) => tracing::info!(
            command = "graph_data",
            include_concepts,
            relation_count,
            paper_id_count,
            min_confidence,
            node_count = graph.nodes.len(),
            edge_count = graph.edges.len(),
            elapsed_ms = started.elapsed().as_millis(),
            "graph command completed"
        ),
        Err(error) => tracing::error!(
            command = "graph_data",
            include_concepts,
            relation_count,
            paper_id_count,
            min_confidence,
            error = %error,
            elapsed_ms = started.elapsed().as_millis(),
            "graph command failed"
        ),
    }
    result
}

// ─── Manual link CRUD ─────────────────────────────────────────────────────

#[tauri::command]
pub async fn paper_link_create(
    state: State<'_, Arc<AppState>>,
    source_paper_id: String,
    target_paper_id: String,
    relation: String,
    snippet: Option<String>,
) -> Result<PaperLink, String> {
    // Validate both papers exist
    let repo = PaperRepo::new(&state.pool);
    if repo
        .get(&source_paper_id)
        .await
        .map_err(|e| e.to_string())?
        .is_none()
    {
        return Err("source paper not found".into());
    }
    if repo
        .get(&target_paper_id)
        .await
        .map_err(|e| e.to_string())?
        .is_none()
    {
        return Err("target paper not found".into());
    }
    PaperLinkRepo::new(&state.pool)
        .create(
            &source_paper_id,
            &target_paper_id,
            &relation,
            "user",
            1.0,
            snippet.as_deref(),
        )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_link_create_or_get(
    state: State<'_, Arc<AppState>>,
    source_paper_id: String,
    target_paper_id: String,
    relation: String,
    snippet: Option<String>,
) -> Result<PaperLink, String> {
    let repo = PaperRepo::new(&state.pool);
    if repo
        .get(&source_paper_id)
        .await
        .map_err(|e| e.to_string())?
        .is_none()
    {
        return Err("source paper not found".into());
    }
    if repo
        .get(&target_paper_id)
        .await
        .map_err(|e| e.to_string())?
        .is_none()
    {
        return Err("target paper not found".into());
    }
    PaperLinkRepo::new(&state.pool)
        .create_or_get(
            &source_paper_id,
            &target_paper_id,
            &relation,
            "user",
            1.0,
            snippet.as_deref(),
        )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_link_delete(state: State<'_, Arc<AppState>>, id: i64) -> Result<(), String> {
    PaperLinkRepo::new(&state.pool)
        .delete(id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_links_for_paper(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
) -> Result<Vec<PaperLink>, String> {
    PaperLinkRepo::new(&state.pool)
        .list_for_paper(&paper_id)
        .await
        .map_err(|e| e.to_string())
}

// ─── AI link discovery ────────────────────────────────────────────────────

#[tauri::command]
pub async fn ai_discover_links(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    paper_ids: Option<Vec<String>>,
) -> Result<LinkBatchSummary, String> {
    let cfg = load_config(&state.paths).map_err(|e| e.to_string())?;
    let prof = active_profile_for_task(&cfg, TaskKind::Link)
        .map_err(|e| e.to_string())?
        .clone();
    let http = state.http.clone();
    let pool = state.pool.clone();

    // Collect papers to analyze
    let paper_repo = PaperRepo::new(&pool);
    let papers = if let Some(ids) = &paper_ids {
        let mut ps = Vec::new();
        for id in ids {
            if let Some(p) = paper_repo.get(id).await.map_err(|e| e.to_string())? {
                ps.push(p);
            }
        }
        ps
    } else {
        paper_repo.list_all().await.map_err(|e| e.to_string())?
    };

    let total = papers.len();
    if total < 2 {
        return Ok(LinkBatchSummary {
            total,
            created: 0,
            skipped: 0,
        });
    }

    // Collect shared terms for context
    let term_repo = PaperTermRepo::new(&pool);
    let all_terms = term_repo.list_all().await.unwrap_or_default();
    let mut term_map: std::collections::HashMap<String, Vec<String>> =
        std::collections::HashMap::new();
    for t in &all_terms {
        term_map
            .entry(t.normalized_term.clone())
            .or_default()
            .push(t.paper_id.clone());
    }

    emit_or_warn(
        &app,
        "ai-link-progress",
        &serde_json::json!({ "phase": "start", "total": total }),
    );

    let discovered = crate::ai::discover_links(&http, &prof, &papers, &term_map)
        .await
        .map_err(|e| e.to_string())?;

    let link_repo = PaperLinkRepo::new(&pool);
    let tuples: Vec<(String, String, String, f64, String)> = discovered
        .iter()
        .map(|d| {
            (
                d.source_paper_id.clone(),
                d.target_paper_id.clone(),
                d.relation.clone(),
                d.confidence,
                d.snippet.clone(),
            )
        })
        .collect();

    let created = link_repo
        .bulk_insert_ai(&tuples)
        .await
        .map_err(|e| e.to_string())?;

    emit_or_warn(
        &app,
        "ai-link-progress",
        &serde_json::json!({ "phase": "done", "created": created }),
    );

    Ok(LinkBatchSummary {
        total,
        created,
        skipped: total.saturating_sub(created),
    })
}

#[tauri::command]
pub async fn ai_accept_link(state: State<'_, Arc<AppState>>, link_id: i64) -> Result<(), String> {
    PaperLinkRepo::new(&state.pool)
        .accept_ai_link(link_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ai_reject_link(state: State<'_, Arc<AppState>>, link_id: i64) -> Result<(), String> {
    PaperLinkRepo::new(&state.pool)
        .delete(link_id)
        .await
        .map_err(|e| e.to_string())
}
