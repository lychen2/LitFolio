//! Project source manifest export for citations, notes, and PDF availability.

use std::sync::Arc;

use chrono::Utc;
use serde::Serialize;
use tauri::State;

use crate::bibtex::generate_bibtex;
use crate::storage::{NoteSection, NoteSectionRepo, Paper, ProjectRepo, ResearchProject};
use crate::AppState;

#[derive(Debug, Serialize)]
pub struct ProjectSourceManifest {
    pub project: ResearchProject,
    pub generated_at: i64,
    pub markdown: String,
    pub paper_count: usize,
    pub pdf_count: usize,
    pub note_section_count: usize,
}

#[tauri::command]
pub async fn project_source_manifest(
    state: State<'_, Arc<AppState>>,
    id: i64,
) -> Result<ProjectSourceManifest, String> {
    let repo = ProjectRepo::new(&state.pool);
    let project = repo
        .get(id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("project {id} not found"))?;
    let papers = repo.list_papers(id).await.map_err(|e| e.to_string())?;
    let notes = project_notes(&state, &papers).await?;
    let markdown = render_manifest(&project, &notes);
    let pdf_count = papers
        .iter()
        .filter(|paper| paper.pdf_path.is_some())
        .count();
    let note_section_count = notes
        .iter()
        .flat_map(|(_paper, sections)| sections)
        .filter(|section| !section.content.trim().is_empty())
        .count();
    Ok(ProjectSourceManifest {
        project,
        generated_at: Utc::now().timestamp(),
        markdown,
        paper_count: papers.len(),
        pdf_count,
        note_section_count,
    })
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

fn render_manifest(project: &ResearchProject, notes: &[(Paper, Vec<NoteSection>)]) -> String {
    let mut out = format!("# Source Manifest: {}\n\n", project.name);
    out.push_str("Export type: BibTeX plus reading-card notes and PDF manifest.\n\n");
    push_pdf_manifest(&mut out, notes);
    push_notes(&mut out, notes);
    push_bibtex(&mut out, notes);
    out
}

fn push_pdf_manifest(out: &mut String, notes: &[(Paper, Vec<NoteSection>)]) {
    out.push_str("## PDF Manifest\n\n");
    if notes.is_empty() {
        out.push_str("- No project papers linked.\n\n");
        return;
    }
    for (paper, _sections) in notes {
        let status = paper
            .pdf_path
            .as_deref()
            .map(|path| format!("available: `{path}`"))
            .unwrap_or_else(|| "missing PDF".to_string());
        out.push_str(&format!("- {}: {status}\n", paper_label(paper)));
    }
    out.push('\n');
}

fn push_notes(out: &mut String, notes: &[(Paper, Vec<NoteSection>)]) {
    out.push_str("## Reading-Card Notes\n\n");
    if notes.is_empty() {
        out.push_str("- No reading-card notes available.\n\n");
        return;
    }
    for (paper, sections) in notes {
        out.push_str(&format!("### {}\n\n", paper_label(paper)));
        let mut wrote = false;
        for section in sections
            .iter()
            .filter(|section| !section.content.trim().is_empty())
        {
            out.push_str(&format!(
                "#### {}\n\n{}\n\n",
                section.section_key,
                section.content.trim()
            ));
            wrote = true;
        }
        if !wrote {
            out.push_str("No reading-card sections filled yet.\n\n");
        }
    }
}

fn push_bibtex(out: &mut String, notes: &[(Paper, Vec<NoteSection>)]) {
    out.push_str("## BibTeX\n\n```bibtex\n");
    for (paper, _sections) in notes {
        let bib = paper
            .bibtex
            .clone()
            .unwrap_or_else(|| generate_bibtex(paper));
        out.push_str(&bib);
        out.push_str("\n\n");
    }
    out.push_str("```\n");
}

fn paper_label(paper: &Paper) -> String {
    paper
        .year
        .map(|year| format!("{} ({year})", paper.title))
        .unwrap_or_else(|| paper.title.clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::{ReadStatus, ResearchProject};

    #[test]
    fn manifest_includes_pdf_notes_and_bibtex() {
        let project = test_project();
        let paper = test_paper();
        let section = NoteSection {
            id: 1,
            paper_id: paper.id.clone(),
            section_key: "method".into(),
            content: "Uses contrastive retrieval.".into(),
            source: "user".into(),
            sort_order: 0,
            created_at: 0,
            updated_at: 0,
        };
        let markdown = render_manifest(&project, &[(paper, vec![section])]);
        assert!(markdown.contains("PDF Manifest"));
        assert!(markdown.contains("available: `/tmp/a.pdf`"));
        assert!(markdown.contains("Uses contrastive retrieval."));
        assert!(markdown.contains("@article"));
    }

    fn test_project() -> ResearchProject {
        ResearchProject {
            id: 1,
            name: "Retrieval Review".into(),
            description: None,
            research_question: None,
            target_output: None,
            status: "active".into(),
            due_date: None,
            paper_count: 1,
            created_at: 0,
            updated_at: 0,
        }
    }

    fn test_paper() -> Paper {
        Paper {
            id: "p1".into(),
            title: "Evidence Retrieval".into(),
            authors: vec!["Ada Lovelace".into()],
            year: Some(2025),
            venue: None,
            doi: None,
            arxiv_id: None,
            abstract_text: None,
            pdf_path: Some("/tmp/a.pdf".into()),
            note_path: None,
            added_at: 0,
            updated_at: 0,
            read_status: ReadStatus::Unread,
            tldr: None,
            research_question: None,
            method: None,
            dataset: None,
            key_findings: vec![],
            limitations: None,
            comparison: None,
            title_translated: None,
            abstract_translated: None,
            translate_target_lang: None,
            translated_at: None,
            bibtex: None,
            last_exported_at: None,
        }
    }
}
