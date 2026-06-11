//! Paper summary and translation IPC commands.

use std::path::Path;
use std::sync::Arc;

use tauri::State;

use crate::ai::{
    active_profile_for_task, load_config, quick_read_paper_text, summarize_paper_text,
    PaperSummaryRequest, QuickReadResult, TaskKind, TldrResult,
};
use crate::ingest::PaperDraft;
use crate::storage::{LibraryPaths, PaperRepo};
use crate::AppState;

/// Resolve body text to send to the LLM for TLDR / QuickRead. Three tiers:
/// 1. `document.md` cache populated by pdfjs in the reader (highest quality);
/// 2. on-the-fly lopdf extraction from the original PDF (cached back to
///    document.md so the next call hits tier 1) — needed because users
///    summarize papers they have not yet opened;
/// 3. None — caller falls back to abstract-only behaviour.
///
/// lopdf is meaningfully weaker than pdfjs on academic PDFs with subset
/// fonts; we accept that downgrade in exchange for not requiring the user
/// to manually open every paper in the reader before requesting a summary.
pub(crate) async fn load_or_extract_pdf_body(
    paths: &LibraryPaths,
    paper_id: &str,
    pdf_path: Option<&str>,
) -> Option<String> {
    if let Some(cached) = paths.read_pdf_text(paper_id) {
        return Some(cached);
    }
    let raw_path = pdf_path?;
    let canonical = paths.ensure_inside_root(Path::new(raw_path)).ok()?;
    let extracted =
        tokio::task::spawn_blocking(move || crate::ingest::extract_markdown_from_path(&canonical))
            .await
            .ok()?
            .ok()?;
    let trimmed = extracted.trim();
    if trimmed.is_empty() {
        return None;
    }
    if let Err(e) = paths.write_pdf_text(paper_id, trimmed) {
        tracing::warn!(error = %e, paper_id, "failed to cache extracted pdf body");
    }
    Some(trimmed.to_string())
}

#[tauri::command]
pub async fn paper_tldr(state: State<'_, Arc<AppState>>, id: String) -> Result<TldrResult, String> {
    let cfg = load_config(&state.paths).map_err(|e| e.to_string())?;
    let output_language = cfg.output_language.as_str();
    let prof = active_profile_for_task(&cfg, TaskKind::Tldr)
        .map_err(|e| e.to_string())?
        .clone();
    let repo = PaperRepo::new(&state.pool);
    let paper = repo
        .get(&id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "paper not found".to_string())?;
    let body = load_or_extract_pdf_body(&state.paths, &id, paper.pdf_path.as_deref()).await;
    let request = PaperSummaryRequest {
        title: &paper.title,
        authors: &paper.authors,
        venue: paper.venue.as_deref(),
        year: paper.year,
        abstract_text: paper.abstract_text.as_deref(),
        body_text: body.as_deref(),
        extra_context: None,
        output_language,
    };
    let result = summarize_paper_text(&state.http, &prof, &request)
        .await
        .map_err(|e| e.to_string())?;
    repo.update_tldr(&id, &result.tldr, &result.key_findings)
        .await
        .map_err(|e| e.to_string())?;
    Ok(result)
}

#[tauri::command]
pub async fn paper_quick_read(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<QuickReadResult, String> {
    let cfg = load_config(&state.paths).map_err(|e| e.to_string())?;
    let output_language = cfg.output_language.as_str();
    let prof = active_profile_for_task(&cfg, TaskKind::QuickRead)
        .map_err(|e| e.to_string())?
        .clone();
    let repo = PaperRepo::new(&state.pool);
    let paper = repo
        .get(&id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "paper not found".to_string())?;
    let body = load_or_extract_pdf_body(&state.paths, &id, paper.pdf_path.as_deref()).await;
    let request = PaperSummaryRequest {
        title: &paper.title,
        authors: &paper.authors,
        venue: paper.venue.as_deref(),
        year: paper.year,
        abstract_text: paper.abstract_text.as_deref(),
        body_text: body.as_deref(),
        extra_context: None,
        output_language,
    };
    let result = quick_read_paper_text(&state.http, &prof, &request)
        .await
        .map_err(|e| e.to_string())?;
    repo.update_quick_read(
        &id,
        &result.problem,
        &result.method,
        &result.comparison,
        &result.limitations,
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(result)
}

#[tauri::command]
pub async fn paper_translate(
    state: State<'_, Arc<AppState>>,
    id: String,
    target_lang: Option<String>,
) -> Result<crate::ai::TranslationResult, String> {
    let cfg = load_config(&state.paths).map_err(|e| e.to_string())?;
    let prof = active_profile_for_task(&cfg, TaskKind::Translate)
        .map_err(|e| e.to_string())?
        .clone();
    let repo = PaperRepo::new(&state.pool);
    let paper = repo
        .get(&id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "paper not found".to_string())?;
    let lang = target_lang.unwrap_or_else(|| "Chinese".to_string());
    let result = crate::ai::translate_paper_text(
        &state.http,
        &prof,
        &paper.title,
        paper.abstract_text.as_deref(),
        &lang,
    )
    .await
    .map_err(|e| e.to_string())?;
    repo.update_translation(
        &id,
        &result.title,
        &result.abstract_text,
        &result.target_lang,
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(result)
}

#[tauri::command]
pub async fn draft_translate(
    state: State<'_, Arc<AppState>>,
    draft: PaperDraft,
    target_lang: Option<String>,
) -> Result<crate::ai::TranslationResult, String> {
    let cfg = load_config(&state.paths).map_err(|e| e.to_string())?;
    let prof = active_profile_for_task(&cfg, TaskKind::Translate).map_err(|e| e.to_string())?;
    let lang = target_lang.unwrap_or_else(|| "Chinese".to_string());
    crate::ai::translate_paper_text(
        &state.http,
        &prof,
        &draft.title,
        draft.abstract_text.as_deref(),
        &lang,
    )
    .await
    .map_err(|e| e.to_string())
}
