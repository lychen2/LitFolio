//! Reader term extractor: Tauri commands and glue.
//!
//! Submodules:
//! - `abbrev`   — abbreviation recognition & initial-matching heuristics.
//! - `candidates` — candidate term extraction with TF-IDF scoring.
//! - `explain`  — LLM-based definition generation.
//! - `evidence` — PDF text cache reads, word-boundary helpers, noise filtering.

mod abbrev;
mod candidates;
mod evidence;
mod explain;

use std::collections::HashMap;
use std::sync::Arc;

use tauri::State;

use crate::ai::{active_reading_profile, load_config, ReadingContextRequest};
use crate::commands::term_filter::{self, is_term_candidate};
use crate::commands::{ai_dispatch::run_reading_dispatch, summaries::freeze_paper_context};
use crate::storage::{NewPaperTerm, PaperDocumentRepo, PaperRepo, PaperTerm, PaperTermRepo};
use crate::AppState;

#[derive(Debug, Clone, serde::Serialize)]
pub struct ReaderPaperTerm {
    pub term: PaperTerm,
    pub related: Vec<crate::storage::RelatedPaperTerm>,
    pub definition_status: String,
}

// ── Tauri commands ──────────────────────────────────────────────────────

#[tauri::command]
pub async fn paper_terms_list(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
) -> Result<Vec<ReaderPaperTerm>, String> {
    let repo = PaperTermRepo::new(&state.pool);
    let terms = repo
        .list_by_paper(&paper_id)
        .await
        .map_err(|e| e.to_string())?;
    enrich_terms(&repo, &paper_id, terms)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_terms_generate(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
) -> Result<Vec<ReaderPaperTerm>, String> {
    paper_terms_generate_candidates(state.clone(), paper_id.clone()).await?;
    terms_explain_impl(&state, &paper_id, "paper_terms_generate").await
}

#[tauri::command]
pub async fn paper_terms_generate_candidates(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
) -> Result<Vec<ReaderPaperTerm>, String> {
    let paper = PaperRepo::new(&state.pool)
        .get(&paper_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "paper not found".to_string())?;
    let body = evidence::extract_pdf_body(&paper, &state.paths).await;
    let body_str = body.as_deref();
    let (found, _) = candidates::extract_candidates(&paper, &PaperRepo::new(&state.pool), body_str)
        .await
        .map_err(|e| e.to_string())?;
    if found.is_empty() {
        return Ok(Vec::new());
    }
    let payload = candidates::pending_payload(found);
    let repo = PaperTermRepo::new(&state.pool);
    let stored = repo
        .replace_for_paper(&paper_id, &payload)
        .await
        .map_err(|e| e.to_string())?;
    enrich_terms(&repo, &paper_id, stored)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_terms_explain(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
) -> Result<Vec<ReaderPaperTerm>, String> {
    terms_explain_impl(&state, &paper_id, "paper_terms_explain").await
}

/// Shared explain flow for the terms group. Resolves the ONE active reading
/// model, freezes a whole-paper context envelope, and runs the provider call
/// under a redacted execution record + cancellation token. Definition writes
/// happen only after the dispatch reaches a successful terminal state.
async fn terms_explain_impl(
    state: &State<'_, Arc<AppState>>,
    paper_id: &str,
    operation: &'static str,
) -> Result<Vec<ReaderPaperTerm>, String> {
    let repo = PaperTermRepo::new(&state.pool);
    let existing = repo
        .list_by_paper(paper_id)
        .await
        .map_err(|e| e.to_string())?;
    if existing.is_empty() {
        return Ok(Vec::new());
    }
    let cfg = load_config(&state.paths).map_err(|e| e.to_string())?;
    let prof = active_reading_profile(&cfg).map_err(|e| e.to_string())?;
    let paper = PaperRepo::new(&state.pool)
        .get(paper_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "paper not found".to_string())?;
    let body = evidence::extract_pdf_body(&paper, &state.paths).await;
    let mut sections = candidates::weighted_metadata_sections(&paper);
    sections.extend(candidates::weighted_body_sections(body.as_deref()));
    let abbrev_long = abbrev::extract_abbrev_pairs(&sections).map_err(|e| e.to_string())?;
    let terms = existing
        .iter()
        .filter(|term| is_explainable_existing_term(term))
        .map(|term| candidates::CandidateTerm {
            term: term.term.clone(),
            score: term.score,
            local_evidence: term.local_evidence.clone(),
        })
        .collect::<Vec<_>>();

    let envelope = freeze_paper_context(
        state,
        &ReadingContextRequest {
            paper_id: paper_id.to_string(),
            selection: None,
            highlight_id: None,
            revision_id: None,
            max_body_chars: None,
        },
        &paper.title,
        paper.abstract_text.as_deref(),
        body.as_deref(),
    )
    .await?;

    let defs = run_reading_dispatch(
        state,
        operation,
        paper_id,
        &prof.name,
        &prof.chat_model,
        &envelope,
        explain::explain_terms(&state.http, &prof, &paper, &terms, &abbrev_long),
    )
    .await?;

    for term in &existing {
        if !is_explainable_existing_term(term) {
            repo.delete(&paper_id, term.id)
                .await
                .map_err(|e| e.to_string())?;
            continue;
        }
        let definition = defs
            .get(&term.term)
            .cloned()
            .unwrap_or_else(|| explain::fallback_definition_for(&term.term));
        repo.update_definition(&paper_id, &term.normalized_term, &definition)
            .await
            .map_err(|e| e.to_string())?;
    }
    let stored = repo
        .list_by_paper(&paper_id)
        .await
        .map_err(|e| e.to_string())?;
    enrich_terms(&repo, &paper_id, stored)
        .await
        .map_err(|e| e.to_string())
}

/// Manually add a single term to the paper's library. If `definition` is empty
/// we fall back to the same LLM explainer used by the auto generator. The new
/// row is upserted by normalized form so repeated additions of the same surface
/// form don't multiply.
#[tauri::command]
pub async fn paper_term_add(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    term: String,
    definition: Option<String>,
    evidence: Option<String>,
) -> Result<ReaderPaperTerm, String> {
    let trimmed = term.trim();
    if trimmed.is_empty() {
        return Err("term must not be empty".into());
    }
    let paper = PaperRepo::new(&state.pool)
        .get(&paper_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "paper not found".to_string())?;
    let evidence_text = match evidence
        .map(|e| e.trim().to_string())
        .filter(|s| !s.is_empty())
    {
        Some(text) => text,
        None => {
            let body = evidence::extract_pdf_body(&paper, &state.paths).await;
            evidence::first_evidence(&paper, body.as_deref(), trimmed)
        }
    };
    let definition_text = match definition
        .map(|d| d.trim().to_string())
        .filter(|s| !s.is_empty())
    {
        Some(text) => text,
        None => {
            let cfg = load_config(&state.paths).map_err(|e| e.to_string())?;
            let prof = active_reading_profile(&cfg).map_err(|e| e.to_string())?;
            let body = evidence::extract_pdf_body(&paper, &state.paths).await;
            let envelope = freeze_paper_context(
                &state,
                &ReadingContextRequest {
                    paper_id: paper_id.clone(),
                    selection: None,
                    highlight_id: None,
                    revision_id: None,
                    max_body_chars: None,
                },
                &paper.title,
                paper.abstract_text.as_deref(),
                body.as_deref(),
            )
            .await?;
            let candidate = candidates::CandidateTerm {
                term: trimmed.to_string(),
                score: 0.0,
                local_evidence: evidence_text.clone(),
            };
            let defs = run_reading_dispatch(
                &state,
                "paper_term_add",
                &paper_id,
                &prof.name,
                &prof.chat_model,
                &envelope,
                explain::explain_terms(
                    &state.http,
                    &prof,
                    &paper,
                    std::slice::from_ref(&candidate),
                    &HashMap::new(),
                ),
            )
            .await?;
            defs.get(trimmed)
                .cloned()
                .unwrap_or_else(|| explain::fallback_definition(&candidate))
        }
    };
    let repo = PaperTermRepo::new(&state.pool);
    let normalized = term_filter::normalize_term(trimmed);
    let row = repo
        .upsert_one(
            &paper_id,
            &NewPaperTerm {
                term: trimmed.to_string(),
                normalized_term: normalized,
                local_definition: definition_text,
                local_evidence: evidence_text,
                // Manually-added terms outrank auto-extracted ones — give them
                // a generous base score so they pin to the top of the list.
                score: 1_000.0,
            },
        )
        .await
        .map_err(|e| e.to_string())?;
    let related = repo
        .related_by_normalized(&row.normalized_term, &paper_id, 3)
        .await
        .map_err(|e| e.to_string())?;
    Ok(ReaderPaperTerm {
        term: row,
        related,
        definition_status: "ready".to_string(),
    })
}

#[tauri::command]
pub async fn paper_term_delete(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    term_id: i64,
) -> Result<(), String> {
    PaperTermRepo::new(&state.pool)
        .delete(&paper_id, term_id)
        .await
        .map_err(|e| e.to_string())
}

/// Frontend hands us Markdown converted from the PDF via pdfjs. The command
/// name is kept for API compatibility with older clients, but the payload is
/// Markdown-first so RAG sees sections, lists, and page markers instead of a
/// flattened text blob.
#[tauri::command]
pub async fn paper_set_pdf_text(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    text: String,
) -> Result<(), String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err("empty pdf markdown".into());
    }
    state
        .paths
        .write_paper_markdown(&paper_id, trimmed)
        .map_err(|e| e.to_string())?;
    PaperDocumentRepo::new(&state.pool)
        .upsert_markdown(&paper_id, trimmed)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Glue ────────────────────────────────────────────────────────────────

async fn enrich_terms(
    repo: &PaperTermRepo<'_>,
    paper_id: &str,
    terms: Vec<PaperTerm>,
) -> anyhow::Result<Vec<ReaderPaperTerm>> {
    let mut out = Vec::with_capacity(terms.len());
    for mut term in terms {
        let definition_status = if term.local_definition == candidates::PENDING_DEFINITION {
            term.local_definition.clear();
            "pending"
        } else {
            "ready"
        };
        let related = repo
            .related_by_normalized(&term.normalized_term, paper_id, 3)
            .await?;
        out.push(ReaderPaperTerm {
            term,
            related,
            definition_status: definition_status.to_string(),
        });
    }
    Ok(out)
}

fn is_explainable_existing_term(term: &PaperTerm) -> bool {
    is_term_candidate(&term.term) && !evidence::is_noise_term(&term.term)
}
