//! Paper comparison IPC commands.

use std::sync::Arc;

use tauri::State;

use crate::ai::{active_profile_for_task, chat_complete, load_config, ChatMessage, TaskKind};
use crate::storage::{ComparisonRepo, Paper, PaperComparison, PaperRepo};
use crate::AppState;

const SYSTEM_PROMPT: &str = "\
You are helping a researcher compare papers before deciding what to read or cite. \
Write a concise Markdown comparison report grounded only in the supplied metadata. \
Use citations in the form [P1], [P2], etc. Do not invent missing results, datasets, \
or limitations.";

#[tauri::command]
pub async fn paper_comparisons_list(
    state: State<'_, Arc<AppState>>,
) -> Result<Vec<PaperComparison>, String> {
    ComparisonRepo::new(&state.pool)
        .list_all()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_comparison_get(
    state: State<'_, Arc<AppState>>,
    id: i64,
) -> Result<Option<PaperComparison>, String> {
    ComparisonRepo::new(&state.pool)
        .get(id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_comparison_create(
    state: State<'_, Arc<AppState>>,
    paper_ids: Vec<String>,
    content: String,
    model: String,
) -> Result<i64, String> {
    ComparisonRepo::new(&state.pool)
        .insert(&paper_ids, &content, &model)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_comparison_generate(
    state: State<'_, Arc<AppState>>,
    paper_ids: Vec<String>,
) -> Result<PaperComparison, String> {
    if paper_ids.len() < 2 {
        return Err("select at least two papers to compare".into());
    }
    let papers = load_papers(state.inner().as_ref(), &paper_ids).await?;
    let cfg = load_config(&state.paths).map_err(|e| e.to_string())?;
    let profile = active_profile_for_task(&cfg, TaskKind::LitReview)
        .map_err(|e| e.to_string())?
        .clone();
    let content = comparison_prompt(&papers, cfg.output_language.as_str());
    let response = chat_complete(
        &state.http,
        &profile,
        &[
            ChatMessage {
                role: "system".into(),
                content: SYSTEM_PROMPT.into(),
            },
            ChatMessage {
                role: "user".into(),
                content,
            },
        ],
    )
    .await
    .map_err(|e| e.to_string())?;
    let repo = ComparisonRepo::new(&state.pool);
    let id = repo
        .insert(&paper_ids, response.content.trim(), &response.model)
        .await
        .map_err(|e| e.to_string())?;
    repo.get(id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "generated comparison was not saved".into())
}

#[tauri::command]
pub async fn paper_comparison_update(
    state: State<'_, Arc<AppState>>,
    id: i64,
    content: String,
) -> Result<(), String> {
    ComparisonRepo::new(&state.pool)
        .update_content(id, &content)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_comparison_delete(
    state: State<'_, Arc<AppState>>,
    id: i64,
) -> Result<(), String> {
    ComparisonRepo::new(&state.pool)
        .delete(id)
        .await
        .map_err(|e| e.to_string())
}

async fn load_papers(state: &AppState, paper_ids: &[String]) -> Result<Vec<Paper>, String> {
    let repo = PaperRepo::new(&state.pool);
    let mut papers = Vec::with_capacity(paper_ids.len());
    for id in paper_ids {
        let paper = repo
            .get(id)
            .await
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("paper not found: {id}"))?;
        papers.push(paper);
    }
    Ok(papers)
}

fn comparison_prompt(papers: &[Paper], output_language: &str) -> String {
    let mut out = format!(
        "Output language: {output_language}.\n\n\
         Compare these papers for a literature review workflow.\n\n\
         Required structure:\n\
         1. Summary table: problem, method, data or setting, main finding, limitation.\n\
         2. Where they agree and differ.\n\
         3. Which paper to read first for which research goal.\n\
         4. Open questions or missing evidence.\n\n"
    );
    for (idx, paper) in papers.iter().enumerate() {
        out.push_str(&format_paper(idx + 1, paper));
    }
    out
}

fn format_paper(index: usize, paper: &Paper) -> String {
    let mut out = format!("[P{index}] {}\n", paper.title);
    out.push_str(&format!("Authors: {}\n", format_authors(&paper.authors)));
    push_field(&mut out, "Year", paper.year.map(|year| year.to_string()));
    push_field(&mut out, "Venue", paper.venue.clone());
    push_field(&mut out, "Abstract", paper.abstract_text.clone());
    push_field(&mut out, "TL;DR", paper.tldr.clone());
    push_field(
        &mut out,
        "Research question",
        paper.research_question.clone(),
    );
    push_field(&mut out, "Method", paper.method.clone());
    push_field(&mut out, "Dataset", paper.dataset.clone());
    if !paper.key_findings.is_empty() {
        push_field(
            &mut out,
            "Key findings",
            Some(paper.key_findings.join("; ")),
        );
    }
    push_field(&mut out, "Comparison notes", paper.comparison.clone());
    push_field(&mut out, "Limitations", paper.limitations.clone());
    out.push('\n');
    out
}

fn push_field(out: &mut String, label: &str, value: Option<String>) {
    if let Some(value) = value {
        let value = value.trim();
        if !value.is_empty() {
            out.push_str(&format!("{label}: {value}\n"));
        }
    }
}

fn format_authors(authors: &[String]) -> String {
    if authors.is_empty() {
        "Unknown".into()
    } else {
        authors.join(", ")
    }
}
