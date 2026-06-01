//! Research project IPC commands.

use std::sync::Arc;

use chrono::Utc;
use serde::Serialize;
use tauri::State;

use crate::bibtex::generate_bibtex;
use crate::storage::{
    CandidatePaper, CandidateRepo, ComparisonRepo, EvidenceRepo, NoteSectionRepo, Paper,
    ProjectDraft, ProjectRepo, ResearchProject,
};
use crate::AppState;

const WEEK_SECONDS: i64 = 604_800;
const MAX_RADAR_CANDIDATES: usize = 12;
const MAX_UNREAD_REMINDERS: usize = 8;
const MIN_TOPIC_TERM_LEN: usize = 4;

#[derive(Debug, Serialize)]
pub struct ProjectWeeklyReview {
    pub project: ResearchProject,
    pub generated_at: i64,
    pub week_start: i64,
    pub topic_terms: Vec<String>,
    pub candidates: Vec<ProjectRadarCandidate>,
    pub unread_core_papers: Vec<ProjectUnreadReminder>,
    pub recent_project_papers: Vec<Paper>,
}

#[derive(Debug, Serialize)]
pub struct ProjectRadarCandidate {
    pub candidate: CandidatePaper,
    pub reason: String,
    pub matched_terms: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct ProjectUnreadReminder {
    pub paper: Paper,
    pub reason: String,
}

#[tauri::command]
pub async fn projects_list(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<ResearchProject>, String> {
    ProjectRepo::new(&state.pool)
        .list()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn project_get(
    state: State<'_, Arc<AppState>>,
    id: i64,
) -> Result<Option<ResearchProject>, String> {
    ProjectRepo::new(&state.pool)
        .get(id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn project_create(
    state: State<'_, Arc<AppState>>,
    draft: ProjectDraft,
) -> Result<ResearchProject, String> {
    ProjectRepo::new(&state.pool)
        .create(&draft)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn project_update(
    state: State<'_, Arc<AppState>>,
    id: i64,
    draft: ProjectDraft,
) -> Result<(), String> {
    ProjectRepo::new(&state.pool)
        .update(id, &draft)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn project_delete(state: State<'_, Arc<AppState>>, id: i64) -> Result<(), String> {
    ProjectRepo::new(&state.pool)
        .delete(id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn project_papers_list(
    state: State<'_, Arc<AppState>>,
    id: i64,
) -> Result<Vec<Paper>, String> {
    ProjectRepo::new(&state.pool)
        .list_papers(id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn project_add_paper(
    state: State<'_, Arc<AppState>>,
    id: i64,
    paper_id: String,
) -> Result<(), String> {
    ProjectRepo::new(&state.pool)
        .add_paper(id, &paper_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn project_remove_paper(
    state: State<'_, Arc<AppState>>,
    id: i64,
    paper_id: String,
) -> Result<(), String> {
    ProjectRepo::new(&state.pool)
        .remove_paper(id, &paper_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn project_weekly_review(
    state: State<'_, Arc<AppState>>,
    id: i64,
) -> Result<ProjectWeeklyReview, String> {
    let repo = ProjectRepo::new(&state.pool);
    let project = repo
        .get(id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("project {id} not found"))?;
    let papers = repo.list_papers(id).await.map_err(|e| e.to_string())?;
    let candidates = CandidateRepo::new(&state.pool)
        .list(false)
        .await
        .map_err(|e| e.to_string())?;
    Ok(build_weekly_review(project, papers, candidates))
}

#[tauri::command]
pub async fn project_export_markdown(
    state: State<'_, Arc<AppState>>,
    id: i64,
) -> Result<String, String> {
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
    let comparisons = ComparisonRepo::new(&state.pool)
        .list_all()
        .await
        .map_err(|e| e.to_string())?;
    let note_repo = NoteSectionRepo::new(&state.pool);
    let mut paper_notes = Vec::new();
    for paper in &papers {
        let notes = note_repo
            .list_by_paper(&paper.id)
            .await
            .map_err(|e| e.to_string())?;
        paper_notes.push((paper, notes));
    }
    Ok(render_project_export(
        &project,
        &papers,
        &paper_notes,
        &evidence,
        &comparisons,
    ))
}

fn render_project_export(
    project: &ResearchProject,
    papers: &[Paper],
    paper_notes: &[(&Paper, Vec<crate::storage::NoteSection>)],
    evidence: &[crate::storage::EvidenceItem],
    comparisons: &[crate::storage::PaperComparison],
) -> String {
    let mut out = format!("# {}\n\n", project.name);
    push_optional(&mut out, "Description", project.description.as_deref());
    push_optional(
        &mut out,
        "Research question",
        project.research_question.as_deref(),
    );
    push_optional(&mut out, "Target output", project.target_output.as_deref());
    out.push_str(&format!("Status: {}\n\n", project.status));

    out.push_str("## Papers\n\n");
    for paper in papers {
        out.push_str(&format!("- {}{}\n", paper.title, year_suffix(paper.year)));
    }
    out.push('\n');

    out.push_str("## Reading Cards\n\n");
    for (paper, notes) in paper_notes {
        out.push_str(&format!("### {}\n\n", paper.title));
        for section in notes
            .iter()
            .filter(|section| !section.content.trim().is_empty())
        {
            out.push_str(&format!(
                "#### {}\n\n{}\n\n",
                section.section_key,
                section.content.trim()
            ));
        }
    }

    out.push_str("## Evidence Board\n\n");
    for item in evidence {
        let title = item.paper_title.as_deref().unwrap_or("Unlinked source");
        out.push_str(&format!("### {title}\n\n"));
        push_optional(&mut out, "Type", item.label.as_deref());
        if let Some(page) = item.page {
            out.push_str(&format!("Page: {page}\n\n"));
        }
        out.push_str(&format!("> {}\n\n", item.excerpt.replace('\n', "\n> ")));
        push_optional(&mut out, "Note", item.note.as_deref());
    }

    out.push_str("## Comparison Reports\n\n");
    let project_paper_ids: std::collections::HashSet<&str> =
        papers.iter().map(|paper| paper.id.as_str()).collect();
    for comparison in comparisons.iter().filter(|comparison| {
        comparison
            .paper_ids
            .iter()
            .any(|paper_id| project_paper_ids.contains(paper_id.as_str()))
    }) {
        out.push_str(&format!(
            "### Comparison {}\n\n{}\n\n",
            comparison.id,
            comparison.content.trim()
        ));
    }

    out.push_str("## BibTeX\n\n```bibtex\n");
    for paper in papers {
        let bib = paper
            .bibtex
            .clone()
            .unwrap_or_else(|| generate_bibtex(paper));
        out.push_str(&bib);
        out.push_str("\n\n");
    }
    out.push_str("```\n");
    out
}

fn push_optional(out: &mut String, label: &str, value: Option<&str>) {
    if let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) {
        out.push_str(&format!("{label}: {value}\n\n"));
    }
}

fn year_suffix(year: Option<i32>) -> String {
    year.map(|value| format!(" ({value})")).unwrap_or_default()
}

fn build_weekly_review(
    project: ResearchProject,
    papers: Vec<Paper>,
    candidates: Vec<CandidatePaper>,
) -> ProjectWeeklyReview {
    let generated_at = Utc::now().timestamp();
    let week_start = generated_at - WEEK_SECONDS;
    let topic_terms = project_topic_terms(&project);
    let radar_candidates = match_candidates(candidates, &topic_terms, week_start);
    let unread_core_papers = unread_reminders(&papers);
    let recent_project_papers = papers
        .into_iter()
        .filter(|paper| paper.added_at >= week_start)
        .collect();
    ProjectWeeklyReview {
        project,
        generated_at,
        week_start,
        topic_terms,
        candidates: radar_candidates,
        unread_core_papers,
        recent_project_papers,
    }
}

fn project_topic_terms(project: &ResearchProject) -> Vec<String> {
    let text = [
        Some(project.name.as_str()),
        project.research_question.as_deref(),
        project.description.as_deref(),
        project.target_output.as_deref(),
    ]
    .into_iter()
    .flatten()
    .collect::<Vec<_>>()
    .join(" ");
    unique_terms(&text)
}

fn unique_terms(text: &str) -> Vec<String> {
    let mut terms = Vec::new();
    for raw in text.split(|ch: char| !ch.is_alphanumeric()) {
        let term = raw.to_lowercase();
        if term.len() >= MIN_TOPIC_TERM_LEN && !terms.contains(&term) {
            terms.push(term);
        }
    }
    terms
}

fn match_candidates(
    candidates: Vec<CandidatePaper>,
    topic_terms: &[String],
    week_start: i64,
) -> Vec<ProjectRadarCandidate> {
    let mut matches = candidates
        .into_iter()
        .filter_map(|candidate| candidate_match(candidate, topic_terms, week_start))
        .collect::<Vec<_>>();
    matches.sort_by(|a, b| {
        b.matched_terms
            .len()
            .cmp(&a.matched_terms.len())
            .then(b.candidate.last_seen_at.cmp(&a.candidate.last_seen_at))
    });
    matches.truncate(MAX_RADAR_CANDIDATES);
    matches
}

fn candidate_match(
    candidate: CandidatePaper,
    topic_terms: &[String],
    week_start: i64,
) -> Option<ProjectRadarCandidate> {
    if candidate.last_seen_at < week_start || topic_terms.is_empty() {
        return None;
    }
    let haystack = candidate_text(&candidate);
    let matched_terms = topic_terms
        .iter()
        .filter(|term| haystack.contains(term.as_str()))
        .cloned()
        .collect::<Vec<_>>();
    if matched_terms.is_empty() {
        return None;
    }
    Some(ProjectRadarCandidate {
        reason: candidate_reason(&candidate, &matched_terms),
        candidate,
        matched_terms,
    })
}

fn candidate_text(candidate: &CandidatePaper) -> String {
    [
        Some(candidate.title.as_str()),
        candidate.abstract_text.as_deref(),
        candidate.venue.as_deref(),
    ]
    .into_iter()
    .flatten()
    .collect::<Vec<_>>()
    .join(" ")
    .to_lowercase()
}

fn candidate_reason(candidate: &CandidatePaper, terms: &[String]) -> String {
    format!(
        "New this week from {}; matches project term(s): {}.",
        candidate.source_type,
        terms.join(", ")
    )
}

fn unread_reminders(papers: &[Paper]) -> Vec<ProjectUnreadReminder> {
    let mut reminders = papers
        .iter()
        .filter(|paper| paper.read_status.as_str() != "read")
        .cloned()
        .map(|paper| ProjectUnreadReminder {
            reason: unread_reason(&paper),
            paper,
        })
        .collect::<Vec<_>>();
    reminders.sort_by(|a, b| {
        read_status_rank(b.paper.read_status.as_str())
            .cmp(&read_status_rank(a.paper.read_status.as_str()))
            .then(b.paper.updated_at.cmp(&a.paper.updated_at))
    });
    reminders.truncate(MAX_UNREAD_REMINDERS);
    reminders
}

fn unread_reason(paper: &Paper) -> String {
    match paper.read_status.as_str() {
        "must" => "Marked must-read for this project.".to_string(),
        "reading" => "Started but not completed.".to_string(),
        _ => "Linked to the project and still unread.".to_string(),
    }
}

fn read_status_rank(status: &str) -> i32 {
    match status {
        "must" => 3,
        "reading" => 2,
        "unread" => 1,
        _ => 0,
    }
}
