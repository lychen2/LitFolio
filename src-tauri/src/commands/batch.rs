//! Batch IPC commands.

use std::future::Future;
use std::sync::Arc;

use tauri::{AppHandle, Emitter, State};
use tokio_util::sync::CancellationToken;

use crate::ai::{
    active_profile_for_task, load_config, quick_read_paper_text, summarize_paper_text, TaskKind,
};
use crate::storage::{Paper, PaperRepo, ReadStatus, TagRepo};
use crate::AppState;

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

async fn install_cancel_token(state: &AppState) -> Result<CancellationToken, String> {
    let mut guard = state.batch_cancel.lock().await;
    if let Some(existing) = guard.as_ref() {
        if !existing.is_cancelled() {
            return Err("a batch is already running; cancel it first".into());
        }
    }
    let tok = CancellationToken::new();
    *guard = Some(tok.clone());
    Ok(tok)
}

async fn clear_cancel_token(state: &AppState) {
    let mut g = state.batch_cancel.lock().await;
    *g = None;
}

#[tauri::command]
pub async fn batch_attach_tag(
    state: State<'_, Arc<AppState>>,
    ids: Vec<String>,
    tag_id: i64,
) -> Result<usize, String> {
    let repo = TagRepo::new(&state.pool);
    let mut ok = 0;
    for id in ids {
        if repo.attach(&id, tag_id).await.is_ok() {
            ok += 1;
        }
    }
    Ok(ok)
}

#[tauri::command]
pub async fn batch_set_status(
    state: State<'_, Arc<AppState>>,
    ids: Vec<String>,
    status: String,
) -> Result<usize, String> {
    let s = match status.as_str() {
        "reading" => ReadStatus::Reading,
        "read" => ReadStatus::Read,
        "must" => ReadStatus::Must,
        _ => ReadStatus::Unread,
    };
    let repo = PaperRepo::new(&state.pool);
    let mut ok = 0;
    for id in ids {
        if repo.set_read_status(&id, s).await.is_ok() {
            ok += 1;
        }
    }
    Ok(ok)
}

#[tauri::command]
pub async fn batch_delete(
    state: State<'_, Arc<AppState>>,
    ids: Vec<String>,
) -> Result<usize, String> {
    let repo = PaperRepo::new(&state.pool);
    let mut ok = 0;
    for id in ids {
        if repo.delete(&id).await.is_ok() {
            ok += 1;
        }
    }
    Ok(ok)
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
        let paper = match repo.get(&id).await.map_err(|e| e.to_string())? {
            Some(p) => p,
            None => {
                errors.push(BatchError {
                    paper_id: id,
                    title: "(missing)".into(),
                    message: "paper not found".into(),
                });
                continue;
            }
        };
        let _ = app.emit(
            "batch-progress",
            serde_json::json!({
                "kind": kind, "done": ok + errors.len(), "total": total,
                "current_id": paper.id, "current_title": paper.title, "phase": "start",
            }),
        );
        match op(paper.clone()).await {
            Ok(()) => {
                ok += 1;
                let _ = app.emit(
                    "batch-progress",
                    serde_json::json!({
                        "kind": kind, "done": ok + errors.len(), "total": total,
                        "current_id": paper.id, "current_title": paper.title, "phase": "ok",
                    }),
                );
            }
            Err(e) => {
                let msg = e.to_string();
                errors.push(BatchError {
                    paper_id: paper.id.clone(),
                    title: paper.title.clone(),
                    message: msg.clone(),
                });
                let _ = app.emit(
                    "batch-progress",
                    serde_json::json!({
                        "kind": kind, "done": ok + errors.len(), "total": total,
                        "current_id": paper.id, "current_title": paper.title,
                        "phase": "fail", "error": msg,
                    }),
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
    let _ = app.emit("batch-done", &summary);
    Ok(summary)
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
            let r = summarize_paper_text(
                &http,
                &prof,
                &paper.title,
                &paper.authors,
                paper.venue.as_deref(),
                paper.year,
                paper.abstract_text.as_deref(),
                body.as_deref(),
                None,
                &output_language,
            )
            .await?;
            PaperRepo::new(&pool)
                .update_tldr(&paper.id, &r.tldr, &r.key_findings)
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
            let r = quick_read_paper_text(
                &http,
                &prof,
                &paper.title,
                &paper.authors,
                paper.venue.as_deref(),
                paper.year,
                paper.abstract_text.as_deref(),
                body.as_deref(),
                None,
                &output_language,
            )
            .await?;
            PaperRepo::new(&pool)
                .update_quick_read(
                    &paper.id,
                    &r.problem,
                    &r.method,
                    &r.comparison,
                    &r.limitations,
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
            let r = crate::ai::translate_paper_text(
                &http,
                &prof,
                &paper.title,
                paper.abstract_text.as_deref(),
                &lang,
            )
            .await?;
            PaperRepo::new(&pool)
                .update_translation(&paper.id, &r.title, &r.abstract_text, &r.target_lang)
                .await?;
            Ok(())
        }
    })
    .await
}

#[tauri::command]
pub async fn batch_cancel(state: State<'_, Arc<AppState>>) -> Result<bool, String> {
    let mut g = state.batch_cancel.lock().await;
    if let Some(t) = g.as_ref() {
        t.cancel();
        return Ok(true);
    }
    *g = None;
    Ok(false)
}
