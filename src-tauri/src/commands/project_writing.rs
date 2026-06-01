//! Project writing deliverables built from traceable local assets.

use std::collections::HashSet;
use std::sync::Arc;

use chrono::Utc;
use serde::Serialize;
use tauri::State;

use super::project_writing_render::render_outline;
use crate::storage::{
    ComparisonRepo, EvidenceRepo, NoteSection, NoteSectionRepo, Paper, PaperComparison,
    ProjectRepo, ResearchProject,
};
use crate::AppState;

#[derive(Debug, Serialize)]
pub struct ProjectWritingOutline {
    pub project: ResearchProject,
    pub generated_at: i64,
    pub markdown: String,
    pub paper_count: usize,
    pub source_count: usize,
    pub section_count: usize,
}

#[tauri::command]
pub async fn project_writing_outline(
    state: State<'_, Arc<AppState>>,
    id: i64,
) -> Result<ProjectWritingOutline, String> {
    let repo = ProjectRepo::new(&state.pool);
    let project = repo
        .get(id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("project {id} not found"))?;
    let papers = repo.list_papers(id).await.map_err(|e| e.to_string())?;
    let evidence = EvidenceRepo::new(&state.pool)
        .list(id)
        .await
        .map_err(|e| e.to_string())?;
    let comparisons = project_comparisons(&state, &papers).await?;
    let paper_notes = project_notes(&state, &papers).await?;
    let markdown = render_outline(&project, &papers, &paper_notes, &evidence, &comparisons);
    let section_count = markdown
        .lines()
        .filter(|line| line.starts_with("## "))
        .count();
    let source_count = papers.len() + evidence.len() + comparisons.len();
    Ok(ProjectWritingOutline {
        project,
        generated_at: Utc::now().timestamp(),
        markdown,
        paper_count: papers.len(),
        source_count,
        section_count,
    })
}

async fn project_comparisons(
    state: &AppState,
    papers: &[Paper],
) -> Result<Vec<PaperComparison>, String> {
    let project_ids = papers
        .iter()
        .map(|paper| paper.id.as_str())
        .collect::<HashSet<_>>();
    let reports = ComparisonRepo::new(&state.pool)
        .list_all()
        .await
        .map_err(|e| e.to_string())?;
    Ok(reports
        .into_iter()
        .filter(|report| {
            report
                .paper_ids
                .iter()
                .any(|paper_id| project_ids.contains(paper_id.as_str()))
        })
        .collect())
}

async fn project_notes(
    state: &AppState,
    papers: &[Paper],
) -> Result<Vec<(Paper, Vec<NoteSection>)>, String> {
    let repo = NoteSectionRepo::new(&state.pool);
    let mut notes = Vec::new();
    for paper in papers {
        notes.push((
            paper.clone(),
            repo.list_by_paper(&paper.id)
                .await
                .map_err(|e| e.to_string())?,
        ));
    }
    Ok(notes)
}
