//! IPC command surface exposed to the React frontend.

pub mod ask;
pub mod feeds;
pub mod survey;

use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use ulid::Ulid;

use crate::ai::{
    active_profile, active_profile_for_task, chat_complete, expand_search_query, list_models,
    load_config, quick_read_paper_text, save_config, summarize_paper_text, ChatMessage,
    ExpandedQuery, LlmConfig, LlmProfile, QuickReadResult, TaskKind, TldrResult,
};
use crate::ingest::{
    discover_topic, discover_topic_multi, fetch_arxiv, fetch_arxiv_category, fetch_doi,
    import_pdf_file, parse_bibtex, search_semantic_scholar, PaperDraft, SearchResult, TopicReport,
    TopicRequest,
};
use crate::storage::{
    notes, Folder, FolderRepo, FolderWithCount, Highlight, HighlightRepo, Paper, PaperRepo,
    ReadStatus, Tag, TagRepo, TagWithCount,
};
use crate::AppState;

#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {name}, welcome to LitFolio.")
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
    PaperRepo::new(&state.pool)
        .count()
        .await
        .map_err(|e| e.to_string())
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
pub async fn papers_in_folder(
    state: State<'_, Arc<AppState>>,
    folder_id: i64,
    limit: Option<i64>,
) -> Result<Vec<Paper>, String> {
    PaperRepo::new(&state.pool)
        .list_by_folder(folder_id, limit.unwrap_or(200))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_get(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<Option<Paper>, String> {
    PaperRepo::new(&state.pool)
        .get(&id)
        .await
        .map_err(|e| e.to_string())
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
    PaperRepo::new(&state.pool)
        .set_read_status(&id, s)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_delete(state: State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    PaperRepo::new(&state.pool)
        .delete(&id)
        .await
        .map_err(|e| e.to_string())?;
    // Best-effort: also remove the paper's directory (PDF + extracted text + any future
    // sidecar files). Failure here must not roll the DB row back — the row is already gone
    // and a leftover folder is recoverable; surfacing the error would only confuse users.
    let dir = state.paths.paper_dir(&id);
    if dir.exists() {
        let _ = std::fs::remove_dir_all(&dir);
    }
    Ok(())
}

// ─── Tags ────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn tags_list(state: State<'_, Arc<AppState>>) -> Result<Vec<TagWithCount>, String> {
    TagRepo::new(&state.pool)
        .list()
        .await
        .map_err(|e| e.to_string())
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
    TagRepo::new(&state.pool)
        .rename(id, &new_name)
        .await
        .map_err(|e| e.to_string())
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
    TagRepo::new(&state.pool)
        .delete(id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_attach_tag(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    tag_id: i64,
) -> Result<(), String> {
    TagRepo::new(&state.pool)
        .attach(&paper_id, tag_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_detach_tag(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    tag_id: i64,
) -> Result<(), String> {
    TagRepo::new(&state.pool)
        .detach(&paper_id, tag_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_tags(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
) -> Result<Vec<Tag>, String> {
    TagRepo::new(&state.pool)
        .for_paper(&paper_id)
        .await
        .map_err(|e| e.to_string())
}

// ─── Folders ─────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn folders_list(state: State<'_, Arc<AppState>>) -> Result<Vec<FolderWithCount>, String> {
    FolderRepo::new(&state.pool)
        .list()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn folder_create(
    state: State<'_, Arc<AppState>>,
    name: String,
    parent_id: Option<i64>,
) -> Result<Folder, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("folder name must not be empty".into());
    }
    FolderRepo::new(&state.pool)
        .create(trimmed, parent_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn folder_rename(
    state: State<'_, Arc<AppState>>,
    id: i64,
    name: String,
) -> Result<(), String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("folder name must not be empty".into());
    }
    FolderRepo::new(&state.pool)
        .rename(id, trimmed)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn folder_delete(state: State<'_, Arc<AppState>>, id: i64) -> Result<(), String> {
    FolderRepo::new(&state.pool)
        .delete(id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_attach_folder(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    folder_id: i64,
) -> Result<(), String> {
    FolderRepo::new(&state.pool)
        .attach(&paper_id, folder_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_detach_folder(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    folder_id: i64,
) -> Result<(), String> {
    FolderRepo::new(&state.pool)
        .detach(&paper_id, folder_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_folders(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
) -> Result<Vec<Folder>, String> {
    FolderRepo::new(&state.pool)
        .for_paper(&paper_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn import_doi(state: State<'_, Arc<AppState>>, doi: String) -> Result<Paper, String> {
    let draft = fetch_doi(&state.http, &doi)
        .await
        .map_err(|e| e.to_string())?;
    let paper = draft.into_paper();
    PaperRepo::new(&state.pool)
        .insert(&paper)
        .await
        .map_err(|e| e.to_string())?;
    Ok(paper)
}

#[tauri::command]
pub async fn import_arxiv(
    state: State<'_, Arc<AppState>>,
    arxiv_id: String,
) -> Result<Paper, String> {
    let draft = fetch_arxiv(&state.http, &arxiv_id)
        .await
        .map_err(|e| e.to_string())?;
    let paper = draft.into_paper();
    PaperRepo::new(&state.pool)
        .insert(&paper)
        .await
        .map_err(|e| e.to_string())?;
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
                    failed.push(PdfFailure {
                        path: p,
                        error: e.to_string(),
                    });
                } else {
                    imported.push(paper);
                }
            }
            Err(e) => failed.push(PdfFailure {
                path: p,
                error: e.to_string(),
            }),
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
    terms: Option<Vec<String>>,
    recent_limit: Option<u32>,
    classic_limit: Option<u32>,
    recent_window_years: Option<u32>,
) -> Result<TopicReport, String> {
    let req = TopicRequest {
        recent_limit: recent_limit.unwrap_or(20),
        classic_limit: classic_limit.unwrap_or(20),
        recent_window_years: recent_window_years.unwrap_or(3),
    };
    if let Some(ts) = terms.as_ref().filter(|v| !v.is_empty()) {
        discover_topic_multi(&state.http, ts, req)
            .await
            .map_err(|e| e.to_string())
    } else {
        discover_topic(&state.http, &query, req)
            .await
            .map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub async fn arxiv_list_category(
    state: State<'_, Arc<AppState>>,
    category: String,
    max_results: Option<u32>,
    start: Option<u32>,
) -> Result<Vec<PaperDraft>, String> {
    fetch_arxiv_category(
        &state.http,
        &category,
        max_results.unwrap_or(50),
        start.unwrap_or(0),
    )
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

pub(crate) async fn download_pdf(
    http: &reqwest::Client,
    url: &str,
    dest: &std::path::Path,
) -> anyhow::Result<u64> {
    use std::io::Write;
    let resp = http.get(url).send().await?;
    if !resp.status().is_success() {
        anyhow::bail!("PDF download returned {}", resp.status());
    }
    let bytes = resp.bytes().await?;
    if bytes.len() < 1024 {
        anyhow::bail!(
            "PDF response too small ({} bytes), likely not a valid PDF",
            bytes.len()
        );
    }
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut f = std::fs::File::create(dest)?;
    f.write_all(&bytes)?;
    Ok(bytes.len() as u64)
}

#[tauri::command]
pub async fn arxiv_add_with_pdf(
    state: State<'_, Arc<AppState>>,
    arxiv_id: String,
) -> Result<Paper, String> {
    let draft = fetch_arxiv(&state.http, &arxiv_id)
        .await
        .map_err(|e| e.to_string())?;
    let resolved_id = draft.arxiv_id.clone().unwrap_or(arxiv_id.clone());
    let stripped = resolved_id
        .split('v')
        .next()
        .unwrap_or(&resolved_id)
        .to_string();
    let pdf_url = format!("https://arxiv.org/pdf/{stripped}.pdf");
    let paper_id = Ulid::new().to_string();
    let pdf_path = state.paths.paper_dir(&paper_id).join("original.pdf");
    download_pdf(&state.http, &pdf_url, &pdf_path)
        .await
        .map_err(|e| format!("failed to download arXiv PDF: {e}"))?;
    let mut paper = draft.into_paper();
    paper.id = paper_id;
    paper.pdf_path = Some(pdf_path.display().to_string());
    PaperRepo::new(&state.pool)
        .insert(&paper)
        .await
        .map_err(|e| e.to_string())?;
    Ok(paper)
}

// ─── Two-step metadata + PDF flow ────────────────────────────────────────

#[tauri::command]
pub async fn prepare_doi_draft(
    state: State<'_, Arc<AppState>>,
    doi: String,
) -> Result<PaperDraft, String> {
    fetch_doi(&state.http, &doi)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn prepare_arxiv_draft(
    state: State<'_, Arc<AppState>>,
    arxiv_id: String,
) -> Result<PaperDraft, String> {
    fetch_arxiv(&state.http, &arxiv_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn paper_save_with_pdf(
    state: State<'_, Arc<AppState>>,
    draft: PaperDraft,
    source_pdf_path: String,
) -> Result<Paper, String> {
    let paper_id = Ulid::new().to_string();
    let dest = state.paths.paper_dir(&paper_id).join("original.pdf");
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::copy(&source_pdf_path, &dest).map_err(|e| format!("copy PDF: {e}"))?;
    let mut paper = draft.into_paper();
    paper.id = paper_id;
    paper.pdf_path = Some(dest.display().to_string());
    PaperRepo::new(&state.pool)
        .insert(&paper)
        .await
        .map_err(|e| e.to_string())?;
    Ok(paper)
}

#[tauri::command]
pub async fn paper_attach_pdf(
    state: State<'_, Arc<AppState>>,
    id: String,
    source_pdf_path: String,
) -> Result<Paper, String> {
    let repo = PaperRepo::new(&state.pool);
    if repo.get(&id).await.map_err(|e| e.to_string())?.is_none() {
        return Err(format!("paper {id} not found"));
    }
    let dest = state.paths.paper_dir(&id).join("original.pdf");
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("create paper dir: {e}"))?;
    }
    std::fs::copy(&source_pdf_path, &dest).map_err(|e| format!("copy PDF: {e}"))?;
    let dest_str = dest.display().to_string();
    repo.update_pdf_path(&id, &dest_str)
        .await
        .map_err(|e| e.to_string())?;
    repo.get(&id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "paper vanished after update".to_string())
}

/// Spawn the system PDF viewer for this paper's bound PDF.
/// We bypass tauri-plugin-shell here because its `open` returns success immediately
/// even when the underlying xdg-open is slow (DE detection) or silently fails — that
/// leaves the UI looking dead. Spawning ourselves at least validates the binary exists
/// and the path is openable; the viewer takes over from there.
#[tauri::command]
pub async fn paper_open_pdf(state: State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    let paper = PaperRepo::new(&state.pool)
        .get(&id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("paper {id} not found"))?;
    let path = paper
        .pdf_path
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "这篇文献还没有绑定 PDF,请先点击 📎 添加 PDF".to_string())?;
    if !std::path::Path::new(&path).exists() {
        return Err(format!("PDF 文件不存在(已被删除或移动):{path}"));
    }
    let opener = if cfg!(target_os = "linux") {
        "xdg-open"
    } else if cfg!(target_os = "macos") {
        "open"
    } else if cfg!(target_os = "windows") {
        "explorer"
    } else {
        return Err("unsupported OS".into());
    };
    std::process::Command::new(opener)
        .arg(&path)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("启动 {opener} 失败: {e}"))?;
    Ok(())
}

/// Return the bound PDF's raw bytes. The frontend wraps these in a Blob URL and
/// feeds it to pdfjs — sidesteps Tauri's asset:// protocol entirely, which has been
/// flaky on this host (no error, no spinner termination, just black screen). Slower
/// than streaming via a custom protocol but the cost is paid once per open.
#[tauri::command]
pub async fn paper_read_pdf_bytes(
    state: State<'_, Arc<AppState>>,
    id: String,
) -> Result<Vec<u8>, String> {
    let paper = PaperRepo::new(&state.pool)
        .get(&id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("paper {id} not found"))?;
    let path = paper
        .pdf_path
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "这篇文献还没有绑定 PDF".to_string())?;
    std::fs::read(&path).map_err(|e| format!("read pdf {path}: {e}"))
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
            ChatMessage {
                role: "system".into(),
                content: "Reply with the single word: pong".into(),
            },
            ChatMessage {
                role: "user".into(),
                content: "ping".into(),
            },
        ],
    )
    .await
    .map_err(|e| e.to_string())?;
    Ok(LlmTestResult {
        ok: !resp.content.trim().is_empty(),
        model: resp.model,
        reply: resp.content,
    })
}

// ─── Paper summarization ─────────────────────────────────────────────────

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
    let result = summarize_paper_text(
        &state.http,
        &prof,
        &paper.title,
        &paper.authors,
        paper.venue.as_deref(),
        paper.year,
        paper.abstract_text.as_deref(),
        None,
        output_language,
    )
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
    let result = quick_read_paper_text(
        &state.http,
        &prof,
        &paper.title,
        &paper.authors,
        paper.venue.as_deref(),
        paper.year,
        paper.abstract_text.as_deref(),
        None,
        output_language,
    )
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
    if let Ok(mut g) = state.batch_cancel.lock() {
        *g = None;
    }
}

// ─── Batch commands (synchronous, no AI) ─────────────────────────────────

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
    clear_cancel_token(&state);
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
    run_ai_batch(app, state, "tldr", ids, move |paper| {
        let http = http.clone();
        let prof = prof.clone();
        let pool = pool.clone();
        let output_language = output_language.clone();
        async move {
            let r = summarize_paper_text(
                &http,
                &prof,
                &paper.title,
                &paper.authors,
                paper.venue.as_deref(),
                paper.year,
                paper.abstract_text.as_deref(),
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
    run_ai_batch(app, state, "quick_read", ids, move |paper| {
        let http = http.clone();
        let prof = prof.clone();
        let pool = pool.clone();
        let output_language = output_language.clone();
        async move {
            let r = quick_read_paper_text(
                &http,
                &prof,
                &paper.title,
                &paper.authors,
                paper.venue.as_deref(),
                paper.year,
                paper.abstract_text.as_deref(),
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
pub fn batch_cancel(state: State<'_, Arc<AppState>>) -> Result<bool, String> {
    let mut g = state.batch_cancel.lock().map_err(|e| e.to_string())?;
    if let Some(t) = g.as_ref() {
        t.cancel();
        return Ok(true);
    }
    *g = None;
    Ok(false)
}

// ─── Reader: highlights + notes ──────────────────────────────────────────

#[tauri::command]
pub async fn highlight_create(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    page: i32,
    rect: serde_json::Value,
    text: String,
    color: Option<String>,
) -> Result<Highlight, String> {
    HighlightRepo::new(&state.pool)
        .insert(&paper_id, page, &rect, &text, color.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn highlight_list(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
) -> Result<Vec<Highlight>, String> {
    HighlightRepo::new(&state.pool)
        .list_by_paper(&paper_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn highlight_update_note(
    state: State<'_, Arc<AppState>>,
    id: String,
    note: Option<String>,
) -> Result<(), String> {
    HighlightRepo::new(&state.pool)
        .update_note(&id, note.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn highlight_delete(state: State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    HighlightRepo::new(&state.pool)
        .delete(&id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn note_get(state: State<'_, Arc<AppState>>, paper_id: String) -> Result<String, String> {
    notes::read(&state.paths, &paper_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn note_save(
    state: State<'_, Arc<AppState>>,
    paper_id: String,
    content: String,
) -> Result<(), String> {
    notes::write(&state.paths, &paper_id, &content).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn llm_list_models(
    state: State<'_, Arc<AppState>>,
    profile: LlmProfile,
) -> Result<Vec<String>, String> {
    list_models(&state.http, &profile)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_expand_query(
    state: State<'_, Arc<AppState>>,
    raw: String,
) -> Result<ExpandedQuery, String> {
    let cfg = load_config(&state.paths).map_err(|e| e.to_string())?;
    let prof = active_profile(&cfg).map_err(|e| e.to_string())?.clone();
    expand_search_query(&state.http, &prof, &raw)
        .await
        .map_err(|e| e.to_string())
}
