//! Concept IPC commands.

use std::sync::Arc;

use tauri::State;

use crate::storage::{Concept, ConceptRelation, ConceptRepo, PaperConcept, PaperRepo};
use crate::AppState;

#[tauri::command]
pub async fn concepts_list(state: State<'_, Arc<AppState>>) -> Result<Vec<Concept>, String> {
    ConceptRepo::new(&state.pool)
        .list_all()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn concept_create(
    state: State<'_, Arc<AppState>>,
    name: String,
    description: Option<String>,
) -> Result<i64, String> {
    ConceptRepo::new(&state.pool)
        .create(&name, description.as_deref(), "user")
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn concept_delete(state: State<'_, Arc<AppState>>, id: i64) -> Result<(), String> {
    ConceptRepo::new(&state.pool)
        .delete(id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn concept_relations_list(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<ConceptRelation>, String> {
    ConceptRepo::new(&state.pool)
        .list_relations()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn concept_relation_create(
    state: State<'_, Arc<AppState>>,
    source_id: i64,
    target_id: i64,
    relation: String,
    evidence_paper_id: Option<String>,
    snippet: Option<String>,
) -> Result<i64, String> {
    ConceptRepo::new(&state.pool)
        .create_relation(
            source_id,
            target_id,
            &relation,
            evidence_paper_id.as_deref(),
            snippet.as_deref(),
        )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn concept_relation_delete(
    state: State<'_, Arc<AppState>>,
    id: i64,
) -> Result<(), String> {
    ConceptRepo::new(&state.pool)
        .delete_relation(id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn concept_link_paper(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    concept_id: i64,
    relevance: Option<f64>,
) -> Result<(), String> {
    ConceptRepo::new(&state.pool)
        .link_paper(&paper_id, concept_id, relevance.unwrap_or(1.0))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn concept_unlink_paper(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    concept_id: i64,
) -> Result<(), String> {
    ConceptRepo::new(&state.pool)
        .unlink_paper(&paper_id, concept_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn concept_for_paper(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
) -> Result<Vec<PaperConcept>, String> {
    ConceptRepo::new(&state.pool)
        .concepts_for_paper(&paper_id)
        .await
        .map_err(|e| e.to_string())
}

fn concept_source_text(paper: &crate::storage::Paper) -> Option<&str> {
    paper
        .abstract_text
        .as_deref()
        .or(paper.tldr.as_deref())
        .filter(|text| !text.is_empty())
}

#[tauri::command]
pub async fn concept_extract_from_paper(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
) -> Result<Vec<crate::ai::ExtractedConcept>, String> {
    let repo = PaperRepo::new(&state.pool);
    let paper = repo
        .get(&paper_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("paper {paper_id} not found"))?;
    let text = concept_source_text(&paper)
        .ok_or_else(|| "paper has no text content for concept extraction".to_string())?;
    crate::ai::extract_concepts(&state.http, &state.paths, &paper.title, text)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn concept_extract_and_store(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
) -> Result<usize, String> {
    let repo = PaperRepo::new(&state.pool);
    let paper = repo
        .get(&paper_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("paper {paper_id} not found"))?;
    let text = concept_source_text(&paper)
        .ok_or_else(|| "paper has no text content for concept extraction".to_string())?;
    let extracted = crate::ai::extract_concepts(&state.http, &state.paths, &paper.title, text)
        .await
        .map_err(|e| e.to_string())?;
    let concept_repo = ConceptRepo::new(&state.pool);
    let mut count = 0usize;

    for ec in &extracted {
        let concept_id = match concept_repo
            .find_by_name(&ec.name)
            .await
            .map_err(|e| e.to_string())?
        {
            Some(c) => c.id,
            None => concept_repo
                .create(&ec.name, Some(&ec.description), "ai")
                .await
                .map_err(|e| e.to_string())?,
        };

        concept_repo
            .link_paper(&paper_id, concept_id, 1.0)
            .await
            .map_err(|e| e.to_string())?;

        for rel in &ec.relations {
            if let Some(target) = concept_repo
                .find_by_name(&rel.target)
                .await
                .map_err(|e| e.to_string())?
            {
                concept_repo
                    .create_relation(
                        concept_id,
                        target.id,
                        &rel.relation,
                        Some(&paper_id),
                        rel.snippet.as_deref(),
                    )
                    .await
                    .map_err(|e| e.to_string())?;
            }
        }

        count += 1;
    }

    Ok(count)
}
