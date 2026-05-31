use std::future::Future;
use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::ai::{
    active_profile_for_task, load_config, quick_read_paper_text, summarize_paper_text,
    PaperSummaryRequest, TaskKind,
};
use crate::storage::{Paper, PaperRepo};
use crate::AppState;

use super::{clear_cancel_token, install_cancel_token};
use crate::commands::events::emit_or_warn;

#[derive(serde::Serialize)]
pub struct BatchError {
    pub paper_id: String,
    pub title: String,
    pub message: String,
}

#[derive(serde::Serialize)]
pub struct BatchSummary {
    pub kind: String,
    pub total: usize,
    pub ok: usize,
    pub failed: usize,
    pub cancelled: bool,
    pub errors: Vec<BatchError>,
}

async fn run_ai_batch<F, Fut>(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    kind: &'static str,
    ids: Vec<String>,
    mut op: F,
) -> Result<BatchSummary, String>
where
    F: FnMut(Paper) -> Fut,
    Fut: Future<Output = anyhow::Result<()>>,
{
    let token = install_cancel_token(&state).await?;
    let total = ids.len();
    let mut ok = 0usize;
    let mut errors = Vec::<BatchError>::new();
    let repo = PaperRepo::new(&state.pool);

    for id in ids {
        if token.is_cancelled() {
            break;
        }
        let Some(paper) = repo.get(&id).await.map_err(|e| e.to_string())? else {
            errors.push(BatchError {
                paper_id: id,
                title: "(missing)".into(),
                message: "paper not found".into(),
            });
            continue;
        };
        emit_progress(&app, kind, ok + errors.len(), total, &paper, "start", None);
        match op(paper.clone()).await {
            Ok(()) => {
                ok += 1;
                emit_progress(&app, kind, ok + errors.len(), total, &paper, "ok", None);
            }
            Err(error) => {
                let message = error.to_string();
                errors.push(BatchError {
                    paper_id: paper.id.clone(),
                    title: paper.title.clone(),
                    message: message.clone(),
                });
                emit_progress(
                    &app,
                    kind,
                    ok + errors.len(),
                    total,
                    &paper,
                    "fail",
                    Some(&message),
                );
            }
        }
    }
    let cancelled = token.is_cancelled();
    clear_cancel_token(&state).await;
    let summary = BatchSummary {
        kind: kind.to_string(),
        total,
        ok,
        failed: errors.len(),
        cancelled,
        errors,
    };
    emit_or_warn(&app, "batch-done", &summary);
    Ok(summary)
}

fn emit_progress(
    app: &AppHandle,
    kind: &str,
    done: usize,
    total: usize,
    paper: &Paper,
    phase: &str,
    error: Option<&str>,
) {
    emit_or_warn(
        app,
        "batch-progress",
        &serde_json::json!({
            "kind": kind,
            "done": done,
            "total": total,
            "current_id": paper.id,
            "current_title": paper.title,
            "phase": phase,
            "error": error,
        }),
    );
}

#[tauri::command]
pub async fn batch_tldr(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    ids: Vec<String>,
) -> Result<BatchSummary, String> {
    let cfg = load_config(&state.paths).map_err(|e| e.to_string())?;
    let output_language = cfg.output_language.clone();
    let prof = active_profile_for_task(&cfg, TaskKind::Tldr)
        .map_err(|e| e.to_string())?
        .clone();
    let http = state.http.clone();
    let pool = state.pool.clone();
    let paths = state.paths.clone();
    run_ai_batch(app, state, "tldr", ids, move |paper| {
        let http = http.clone();
        let prof = prof.clone();
        let pool = pool.clone();
        let paths = paths.clone();
        let output_language = output_language.clone();
        async move {
            let body = crate::commands::summaries::load_or_extract_pdf_body(
                &paths,
                &paper.id,
                paper.pdf_path.as_deref(),
            )
            .await;
            let request = summary_request(&paper, body.as_deref(), &output_language);
            let result = summarize_paper_text(&http, &prof, &request).await?;
            PaperRepo::new(&pool)
                .update_tldr(&paper.id, &result.tldr, &result.key_findings)
                .await?;
            Ok(())
        }
    })
    .await
}

#[tauri::command]
pub async fn batch_quick_read(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    ids: Vec<String>,
) -> Result<BatchSummary, String> {
    let cfg = load_config(&state.paths).map_err(|e| e.to_string())?;
    let output_language = cfg.output_language.clone();
    let prof = active_profile_for_task(&cfg, TaskKind::QuickRead)
        .map_err(|e| e.to_string())?
        .clone();
    let http = state.http.clone();
    let pool = state.pool.clone();
    let paths = state.paths.clone();
    run_ai_batch(app, state, "quick_read", ids, move |paper| {
        let http = http.clone();
        let prof = prof.clone();
        let pool = pool.clone();
        let paths = paths.clone();
        let output_language = output_language.clone();
        async move {
            let body = crate::commands::summaries::load_or_extract_pdf_body(
                &paths,
                &paper.id,
                paper.pdf_path.as_deref(),
            )
            .await;
            let request = summary_request(&paper, body.as_deref(), &output_language);
            let result = quick_read_paper_text(&http, &prof, &request).await?;
            PaperRepo::new(&pool)
                .update_quick_read(
                    &paper.id,
                    &result.problem,
                    &result.method,
                    &result.comparison,
                    &result.limitations,
                )
                .await?;
            Ok(())
        }
    })
    .await
}

#[tauri::command]
pub async fn batch_translate(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    ids: Vec<String>,
    target_lang: Option<String>,
) -> Result<BatchSummary, String> {
    let cfg = load_config(&state.paths).map_err(|e| e.to_string())?;
    let prof = active_profile_for_task(&cfg, TaskKind::Translate)
        .map_err(|e| e.to_string())?
        .clone();
    let lang = target_lang.unwrap_or_else(|| "Chinese".to_string());
    let http = state.http.clone();
    let pool = state.pool.clone();
    run_ai_batch(app, state, "translate", ids, move |paper| {
        let http = http.clone();
        let prof = prof.clone();
        let pool = pool.clone();
        let lang = lang.clone();
        async move {
            let result = crate::ai::translate_paper_text(
                &http,
                &prof,
                &paper.title,
                paper.abstract_text.as_deref(),
                &lang,
            )
            .await?;
            PaperRepo::new(&pool)
                .update_translation(
                    &paper.id,
                    &result.title,
                    &result.abstract_text,
                    &result.target_lang,
                )
                .await?;
            Ok(())
        }
    })
    .await
}

fn summary_request<'a>(
    paper: &'a Paper,
    body: Option<&'a str>,
    output_language: &'a str,
) -> PaperSummaryRequest<'a> {
    PaperSummaryRequest {
        title: &paper.title,
        authors: &paper.authors,
        venue: paper.venue.as_deref(),
        year: paper.year,
        abstract_text: paper.abstract_text.as_deref(),
        body_text: body,
        extra_context: None,
        output_language,
    }
}
