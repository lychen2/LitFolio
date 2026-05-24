//! IPC command surface exposed to the React frontend.

use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use ulid::Ulid;

use crate::ai::{
    active_profile, active_profile_for_task, chat_complete, load_config, quick_read_paper_text,
    save_config, summarize_paper_text, ChatMessage, LlmConfig, LlmProfile, QuickReadResult,
    TaskKind, TldrResult,
};
use crate::ingest::{
    discover_topic, fetch_arxiv, fetch_arxiv_category, fetch_doi, import_pdf_file, parse_bibtex,
    search_semantic_scholar, PaperDraft, SearchResult, TopicReport, TopicRequest,
};
use crate::storage::{Paper, PaperRepo, ReadStatus, Tag, TagRepo, TagWithCount};
use crate::AppState;

#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {name}, welcome to Litera.")
}

#[tauri::command]
pub fn app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

#[tauri::command]
pub fn library_root(state: State<'_, Arc<AppState>>) -> String {
    state.paths.root.display().to_string()
}

#[tauri::command]
pub async fn papers_count(state: State<'_, Arc<AppState>>) -> Result<i64, String> {
    PaperRepo::new(&state.pool).count().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn papers_recent(
    state: State<'_, Arc<AppState>>,
    limit: Option<i64>,
) -> Result<Vec<Paper>, String> {
    PaperRepo::new(&state.pool)
        .list_recent(limit.unwrap_or(50))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_get(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<Option<Paper>, String> {
    PaperRepo::new(&state.pool).get(&id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn papers_search(
    state: State<'_, Arc<AppState>>,
    query: String,
    limit: Option<i64>,
) -> Result<Vec<Paper>, String> {
    PaperRepo::new(&state.pool)
        .search(&query, limit.unwrap_or(100))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_set_read_status(
    state: State<'_, Arc<AppState>>,
    id: String,
    status: String,
) -> Result<(), String> {
    let s = match status.as_str() {
        "reading" => ReadStatus::Reading,
        "read" => ReadStatus::Read,
        "must" => ReadStatus::Must,
        _ => ReadStatus::Unread,
    };
    PaperRepo::new(&state.pool).set_read_status(&id, s).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_delete(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<(), String> {
    PaperRepo::new(&state.pool).delete(&id).await.map_err(|e| e.to_string())
}

// ─── Tags ────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn tags_list(state: State<'_, Arc<AppState>>) -> Result<Vec<TagWithCount>, String> {
    TagRepo::new(&state.pool).list().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn tag_create(
    state: State<'_, Arc<AppState>>,
    name: String,
    color: Option<String>,
) -> Result<Tag, String> {
    TagRepo::new(&state.pool)
        .create(&name, color.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn tag_rename(
    state: State<'_, Arc<AppState>>,
    id: i64,
    new_name: String,
) -> Result<(), String> {
    TagRepo::new(&state.pool).rename(id, &new_name).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn tag_set_color(
    state: State<'_, Arc<AppState>>,
    id: i64,
    color: Option<String>,
) -> Result<(), String> {
    TagRepo::new(&state.pool)
        .set_color(id, color.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn tag_delete(state: State<'_, Arc<AppState>>, id: i64) -> Result<(), String> {
    TagRepo::new(&state.pool).delete(id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_attach_tag(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    tag_id: i64,
) -> Result<(), String> {
    TagRepo::new(&state.pool).attach(&paper_id, tag_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_detach_tag(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    tag_id: i64,
) -> Result<(), String> {
    TagRepo::new(&state.pool).detach(&paper_id, tag_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_tags(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
) -> Result<Vec<Tag>, String> {
    TagRepo::new(&state.pool).for_paper(&paper_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn import_doi(
    state: State<'_, Arc<AppState>>,
    doi: String,
) -> Result<Paper, String> {
    let draft = fetch_doi(&state.http, &doi).await.map_err(|e| e.to_string())?;
    let paper = draft.into_paper();
    PaperRepo::new(&state.pool).insert(&paper).await.map_err(|e| e.to_string())?;
    Ok(paper)
}

#[tauri::command]
pub async fn import_arxiv(
    state: State<'_, Arc<AppState>>,
    arxiv_id: String,
) -> Result<Paper, String> {
    let draft = fetch_arxiv(&state.http, &arxiv_id).await.map_err(|e| e.to_string())?;
    let paper = draft.into_paper();
    PaperRepo::new(&state.pool).insert(&paper).await.map_err(|e| e.to_string())?;
    Ok(paper)
}

#[tauri::command]
pub async fn import_bibtex(
    state: State<'_, Arc<AppState>>,
    text: String,
) -> Result<Vec<Paper>, String> {
    let drafts = parse_bibtex(&text);
    let repo = PaperRepo::new(&state.pool);
    let mut papers = Vec::with_capacity(drafts.len());
    for d in drafts {
        let p = d.into_paper();
        repo.insert(&p).await.map_err(|e| e.to_string())?;
        papers.push(p);
    }
    Ok(papers)
}

#[derive(serde::Serialize)]
pub struct PdfImportSummary {
    pub imported: Vec<Paper>,
    pub failed: Vec<PdfFailure>,
}

#[derive(serde::Serialize)]
pub struct PdfFailure {
    pub path: String,
    pub error: String,
}

#[tauri::command]
pub async fn import_pdf_files(
    state: State<'_, Arc<AppState>>,
    paths: Vec<String>,
) -> Result<PdfImportSummary, String> {
    let library = state.paths.clone();
    let repo = PaperRepo::new(&state.pool);
    let mut imported = Vec::new();
    let mut failed = Vec::new();
    for p in paths {
        let path = PathBuf::from(&p);
        let paper_id = Ulid::new().to_string();
        let library_clone = library.clone();
        let path_clone = path.clone();
        let id_clone = paper_id.clone();
        let result = tokio::task::spawn_blocking(move || {
            import_pdf_file(&path_clone, &id_clone, &library_clone)
        })
        .await
        .map_err(|e| e.to_string())?;
        match result {
            Ok(r) => {
                let mut paper = r.draft.into_paper();
                paper.id = paper_id;
                paper.pdf_path = Some(r.stored_path.display().to_string());
                if let Err(e) = repo.insert(&paper).await {
                    failed.push(PdfFailure { path: p, error: e.to_string() });
                } else {
                    imported.push(paper);
                }
            }
            Err(e) => failed.push(PdfFailure { path: p, error: e.to_string() }),
        }
    }
    Ok(PdfImportSummary { imported, failed })
}

#[tauri::command]
pub async fn search_papers(
    state: State<'_, Arc<AppState>>,
    query: String,
    limit: Option<u32>,
) -> Result<Vec<SearchResult>, String> {
    search_semantic_scholar(&state.http, &query, limit.unwrap_or(15))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_from_search(
    state: State<'_, Arc<AppState>>,
    result: SearchResult,
) -> Result<Paper, String> {
    let paper = result.draft.into_paper();
    PaperRepo::new(&state.pool)
        .insert(&paper)
        .await
        .map_err(|e| e.to_string())?;
    Ok(paper)
}

#[derive(serde::Serialize)]
pub struct BulkAddSummary {
    pub imported: Vec<Paper>,
    pub skipped: Vec<String>,
}

#[tauri::command]
pub async fn add_many_from_search(
    state: State<'_, Arc<AppState>>,
    results: Vec<SearchResult>,
) -> Result<BulkAddSummary, String> {
    let repo = PaperRepo::new(&state.pool);
    let mut imported = Vec::new();
    let mut skipped = Vec::new();
    for r in results {
        let paper = r.draft.into_paper();
        match repo.insert(&paper).await {
            Ok(()) => imported.push(paper),
            Err(e) => skipped.push(format!("{}: {}", paper.title, e)),
        }
    }
    Ok(BulkAddSummary { imported, skipped })
}

#[tauri::command]
pub async fn topic_discover(
    state: State<'_, Arc<AppState>>,
    query: String,
    recent_limit: Option<u32>,
    classic_limit: Option<u32>,
    recent_window_years: Option<u32>,
) -> Result<TopicReport, String> {
    let req = TopicRequest {
        recent_limit: recent_limit.unwrap_or(20),
        classic_limit: classic_limit.unwrap_or(20),
        recent_window_years: recent_window_years.unwrap_or(3),
    };
    discover_topic(&state.http, &query, req)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn arxiv_list_category(
    state: State<'_, Arc<AppState>>,
    category: String,
    max_results: Option<u32>,
) -> Result<Vec<PaperDraft>, String> {
    fetch_arxiv_category(&state.http, &category, max_results.unwrap_or(50))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn arxiv_add_draft(
    state: State<'_, Arc<AppState>>,
    draft: PaperDraft,
) -> Result<Paper, String> {
    let paper = draft.into_paper();
    PaperRepo::new(&state.pool)
        .insert(&paper)
        .await
        .map_err(|e| e.to_string())?;
    Ok(paper)
}

// ─── LLM config ──────────────────────────────────────────────────────────

#[tauri::command]
pub fn llm_get_config(state: State<'_, Arc<AppState>>) -> Result<LlmConfig, String> {
    load_config(&state.paths).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn llm_save_config(state: State<'_, Arc<AppState>>, config: LlmConfig) -> Result<(), String> {
    save_config(&state.paths, &config).map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
pub struct LlmTestResult {
    pub ok: bool,
    pub model: String,
    pub reply: String,
}

#[tauri::command]
pub async fn llm_test(
    state: State<'_, Arc<AppState>>,
    profile: LlmProfile,
) -> Result<LlmTestResult, String> {
    let resp = chat_complete(
        &state.http,
        &profile,
        &[
            ChatMessage { role: "system".into(), content: "Reply with the single word: pong".into() },
            ChatMessage { role: "user".into(), content: "ping".into() },
        ],
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(LlmTestResult { ok: !resp.content.trim().is_empty(), model: resp.model, reply: resp.content })
}

// ─── Paper summarization ─────────────────────────────────────────────────

#[tauri::command]
pub async fn paper_tldr(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<TldrResult, String> {
    let cfg = load_config(&state.paths).map_err(|e| e.to_string())?;
    let prof = active_profile_for_task(&cfg, TaskKind::Tldr).map_err(|e| e.to_string())?.clone();
    let repo = PaperRepo::new(&state.pool);
    let paper = repo.get(&id).await.map_err(|e| e.to_string())?
        .ok_or_else(|| "paper not found".to_string())?;
    let result = summarize_paper_text(
        &state.http,
        &prof,
        &paper.title,
        &paper.authors,
        paper.venue.as_deref(),
        paper.year,
        paper.abstract_text.as_deref(),
        None,
    )
    .await
    .map_err(|e| e.to_string())?;
    repo.update_tldr(&id, &result.tldr, &result.key_findings)
        .await.map_err(|e| e.to_string())?;
    Ok(result)
}

#[tauri::command]
pub async fn paper_quick_read(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<QuickReadResult, String> {
    let cfg = load_config(&state.paths).map_err(|e| e.to_string())?;
    let prof = active_profile_for_task(&cfg, TaskKind::QuickRead).map_err(|e| e.to_string())?.clone();
    let repo = PaperRepo::new(&state.pool);
    let paper = repo.get(&id).await.map_err(|e| e.to_string())?
        .ok_or_else(|| "paper not found".to_string())?;
    let result = quick_read_paper_text(
        &state.http,
        &prof,
        &paper.title,
        &paper.authors,
        paper.venue.as_deref(),
        paper.year,
        paper.abstract_text.as_deref(),
        None,
    )
    .await
    .map_err(|e| e.to_string())?;
    repo.update_quick_read(
        &id, &result.problem, &result.method, &result.comparison, &result.limitations,
    )
    .await.map_err(|e| e.to_string())?;
    Ok(result)
}

#[tauri::command]
pub async fn paper_translate(
    state: State<'_, Arc<AppState>>,
    id: String,
    target_lang: Option<String>,
) -> Result<crate::ai::TranslationResult, String> {
    let cfg = load_config(&state.paths).map_err(|e| e.to_string())?;
    let prof = active_profile_for_task(&cfg, TaskKind::Translate).map_err(|e| e.to_string())?.clone();
    let repo = PaperRepo::new(&state.pool);
    let paper = repo.get(&id).await.map_err(|e| e.to_string())?
        .ok_or_else(|| "paper not found".to_string())?;
    let lang = target_lang.unwrap_or_else(|| "Chinese".to_string());
    let result = crate::ai::translate_paper_text(
        &state.http, &prof, &paper.title, paper.abstract_text.as_deref(), &lang,
    )
    .await.map_err(|e| e.to_string())?;
    repo.update_translation(&id, &result.title, &result.abstract_text, &result.target_lang)
        .await.map_err(|e| e.to_string())?;
    Ok(result)
}

// ─── Batch primitives ────────────────────────────────────────────────────

use tokio_util::sync::CancellationToken;

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

fn install_cancel_token(state: &AppState) -> Result<CancellationToken, String> {
    let mut guard = state.batch_cancel.lock().map_err(|e| e.to_string())?;
    if let Some(existing) = guard.as_ref() {
        if !existing.is_cancelled() {
            return Err("a batch is already running; cancel it first".into());
        }
    }
    let tok = CancellationToken::new();
    *guard = Some(tok.clone());
    Ok(tok)
}

fn clear_cancel_token(state: &AppState) {
    if let Ok(mut g) = state.batch_cancel.lock() { *g = None; }
}

// ─── Batch commands (synchronous, no AI) ─────────────────────────────────

#[tauri::command]
pub async fn batch_attach_tag(
    state: State<'_, Arc<AppState>>,
    ids: Vec<String>, tag_id: i64,
) -> Result<usize, String> {
    let repo = TagRepo::new(&state.pool);
    let mut ok = 0;
    for id in ids {
        if repo.attach(&id, tag_id).await.is_ok() { ok += 1; }
    }
    Ok(ok)
}

#[tauri::command]
pub async fn batch_set_status(
    state: State<'_, Arc<AppState>>,
    ids: Vec<String>, status: String,
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
        if repo.set_read_status(&id, s).await.is_ok() { ok += 1; }
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
        if repo.delete(&id).await.is_ok() { ok += 1; }
    }
    Ok(ok)
}

// ─── Batch commands (AI, with progress events) ──────────────────────────

async fn run_ai_batch<F, Fut>(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    kind: &'static str,
    ids: Vec<String>,
    mut op: F,
) -> Result<BatchSummary, String>
where
    F: FnMut(Paper) -> Fut,
    Fut: std::future::Future<Output = anyhow::Result<()>>,
{
    let token = install_cancel_token(&state)?;
    let total = ids.len();
    let mut ok = 0usize;
    let mut errors = Vec::<BatchError>::new();
    let repo = PaperRepo::new(&state.pool);

    for id in ids {
        if token.is_cancelled() { break; }
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
        let _ = app.emit("batch-progress", serde_json::json!({
            "kind": kind, "done": ok + errors.len(), "total": total,
            "current_id": paper.id, "current_title": paper.title, "phase": "start",
        }));
        match op(paper.clone()).await {
            Ok(()) => {
                ok += 1;
                let _ = app.emit("batch-progress", serde_json::json!({
                    "kind": kind, "done": ok + errors.len(), "total": total,
                    "current_id": paper.id, "current_title": paper.title, "phase": "ok",
                }));
            }
            Err(e) => {
                let msg = e.to_string();
                errors.push(BatchError {
                    paper_id: paper.id.clone(),
                    title: paper.title.clone(),
                    message: msg.clone(),
                });
                let _ = app.emit("batch-progress", serde_json::json!({
                    "kind": kind, "done": ok + errors.len(), "total": total,
                    "current_id": paper.id, "current_title": paper.title,
                    "phase": "fail", "error": msg,
                }));
            }
        }
    }
    let cancelled = token.is_cancelled();
    clear_cancel_token(&state);
    let summary = BatchSummary {
        kind: kind.to_string(),
        total, ok, failed: errors.len(), cancelled, errors,
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
    let prof = active_profile_for_task(&cfg, TaskKind::Tldr).map_err(|e| e.to_string())?.clone();
    let http = state.http.clone();
    let pool = state.pool.clone();
    run_ai_batch(app, state, "tldr", ids, move |paper| {
        let http = http.clone();
        let prof = prof.clone();
        let pool = pool.clone();
        async move {
            let r = summarize_paper_text(
                &http, &prof, &paper.title, &paper.authors, paper.venue.as_deref(),
                paper.year, paper.abstract_text.as_deref(), None,
            ).await?;
            PaperRepo::new(&pool)
                .update_tldr(&paper.id, &r.tldr, &r.key_findings).await?;
            Ok(())
        }
    }).await
}
