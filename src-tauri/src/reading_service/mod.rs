//! Owns the bundled LitFolio service. Python alone writes reading workspaces.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
#[cfg(not(target_os = "android"))]
use std::process::Stdio;
use std::time::Duration;

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
#[cfg(not(target_os = "android"))]
use tauri_plugin_shell::ShellExt;
#[cfg(not(target_os = "android"))]
use tokio::io::{AsyncBufReadExt, BufReader};
#[cfg(not(target_os = "android"))]
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

use crate::commands::pdf::common::{log_pdf_import_summary, PdfFailure, PdfImportSummary};
use crate::ai::{active_reading_profile, load_config};
use crate::storage::{notes, HighlightRepo, Paper, PaperRepo, PdfNote, PdfNoteRepo, ReadStatus, TagRepo};
use crate::storage::reading_catalog::{project_reading_catalog, ReadingCatalogItem};
use crate::storage::reading_document::DocumentProjection;
use crate::AppState;

#[cfg(target_os = "android")]
mod android;
#[cfg(target_os = "android")]
pub(crate) use android::init as android_plugin;

mod mutations;
pub use mutations::TagChange;

#[derive(Default)]
pub struct ReadingService {
    runtime: Mutex<Option<Runtime>>,
}

struct Runtime {
    #[cfg(not(target_os = "android"))]
    process: ServiceProcess,
    #[cfg(target_os = "android")]
    plugin: android::AndroidReadingPlugin,
    url: String,
    token: String,
    http: reqwest::Client,
    documents: DocumentProjection,
}

#[cfg(not(target_os = "android"))]
// Dropping an unsuccessful startup must also reap the frozen interpreter child.
struct ServiceProcess {
    child: Child,
    pid: u32,
}

#[cfg(not(target_os = "android"))]
impl ServiceProcess {
    fn terminate_tree(&mut self) {
        #[cfg(unix)]
        // Each service starts its own process group, never the application's group.
        unsafe {
            libc::kill(-(self.pid as i32), libc::SIGKILL);
        }
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            let _ = std::process::Command::new("taskkill")
                .creation_flags(0x08000000)
                .args(["/PID", &self.pid.to_string(), "/T", "/F"])
                .status();
        }
        let _ = self.child.start_kill();
    }
}

#[cfg(not(target_os = "android"))]
impl Drop for ServiceProcess {
    fn drop(&mut self) {
        if !matches!(self.child.try_wait(), Ok(Some(_))) {
            self.terminate_tree();
        }
    }
}

#[derive(Deserialize)]
struct LibrarySession {
    token: String,
}

#[derive(Deserialize)]
struct WorkspaceId {
    id: String,
}

#[derive(Deserialize)]
struct Catalog {
    items: Vec<ReadingCatalogItem>,
}

#[derive(Deserialize)]
struct ImportedWorkspace {
    id: String,
}

#[derive(Deserialize)]
struct ImportResult {
    imported: Vec<ImportedWorkspace>,
    failed: Vec<PdfFailure>,
}

#[derive(Serialize)]
pub struct ReadingSession {
    url: String,
}

#[derive(Serialize)]
struct LegacyHighlight<'a> {
    id: &'a str,
    page: i32,
    text: &'a str,
    note: &'a Option<String>,
    color: &'a str,
    rect_json: &'a serde_json::Value,
}

#[derive(Serialize)]
struct HostPaper<'a> {
    id: &'a str,
    title: &'a str,
    authors: &'a [String],
    year: Option<i32>,
    venue: &'a Option<String>,
    doi: &'a Option<String>,
    arxiv_id: &'a Option<String>,
    pdf_path: Option<&'a Path>,
    abstract_text: &'a Option<String>,
    status: &'static str,
    starred: bool,
    tags: Vec<&'a str>,
    added_at: i64,
    note: &'a str,
    highlights: Vec<LegacyHighlight<'a>>,
    pdf_notes: &'a [PdfNote],
}

fn reading_home(app_config_dir: &Path) -> Result<PathBuf> {
    let home = app_config_dir.join("core");
    let legacy_home = app_config_dir.join("easyread");
    if !home.try_exists()? && legacy_home.try_exists()? {
        std::fs::rename(&legacy_home, &home).with_context(|| {
            format!("move reading settings from {} to {}", legacy_home.display(), home.display())
        })?;
    }
    Ok(home)
}

impl ReadingService {
    pub async fn open(&self, app: &AppHandle, state: &AppState, id: Option<&str>) -> Result<ReadingSession> {
        // Serializes startup, legacy attachment and catalog projection across frames.
        let mut guard = self.runtime.lock().await;
        #[cfg(not(target_os = "android"))]
        if let Some(runtime) = guard.as_mut() {
            if runtime.process.child.try_wait()?.is_some() {
                *guard = None;
            }
        }
        if guard.is_none() {
            #[cfg(not(target_os = "android"))]
            let command: std::process::Command = app.shell().sidecar("core")?.into();
            let library = state.paths.root.join("reading");
            let home = reading_home(&app.path().app_config_dir()?)?;
            #[cfg(not(target_os = "android"))]
            let runtime = Runtime::start(command, &home, &library).await?;
            #[cfg(target_os = "android")]
            let runtime = app.state::<android::AndroidReadingPlugin>().start(&home, &library).await?;
            *guard = Some(runtime);
        }
        let runtime = guard.as_mut().context("reading service did not start")?;
        runtime.configure(state).await?;
        let catalog = runtime.catalog().await?;
        let known: HashSet<&str> = catalog.items.iter().map(|item| item.id.as_str()).collect();
        runtime.attach_missing(state, &known, id).await?;
        runtime.project(state).await?;
        Ok(ReadingSession {
            url: match id {
                Some(id) => format!("{}/read/{id}", runtime.url),
                None => format!("{}/", runtime.url),
            },
        })
    }

    pub async fn import_files(&self, app: &AppHandle, state: &AppState, paths: Vec<String>) -> Result<PdfImportSummary> {
        self.open(app, state, None).await?;
        let mut guard = self.runtime.lock().await;
        let runtime = guard.as_mut().context("reading service is not running")?;
        runtime.import_files(state, paths).await
    }

    pub async fn sync_catalog(&self, state: &AppState) -> Result<()> {
        let mut guard = self.runtime.lock().await;
        let runtime = guard.as_mut().context("reading service is not running")?;
        runtime.project(state).await
    }

    pub async fn refresh_profile(&self, state: &AppState) -> Result<()> {
        if let Some(runtime) = self.runtime.lock().await.as_ref() {
            runtime.configure(state).await?;
        }
        Ok(())
    }

    #[cfg(target_os = "android")]
    pub async fn stop(&self) {
        if let Some(runtime) = self.runtime.lock().await.take() {
            runtime.plugin.stop().await;
        }
    }

    #[cfg(not(target_os = "android"))]
    pub async fn stop(&self) {
        if let Some(mut runtime) = self.runtime.lock().await.take() {
            // Use the service's own exit path so the frozen bootloader can reap it.
            let _ = tokio::time::timeout(
                Duration::from_secs(3),
                runtime.post("/api/host/shutdown", &serde_json::json!({})),
            ).await;
            if !matches!(
                tokio::time::timeout(Duration::from_secs(3), runtime.process.child.wait()).await,
                Ok(Ok(_))
            ) {
                runtime.process.terminate_tree();
                let _ = runtime.process.child.wait().await;
            }
            // PDF preparation is not model work: its worker may outlive a clean
            // Python server exit. Reap our remaining group in the normal path too.
            #[cfg(unix)]
            {
                runtime.process.terminate_tree();
                let _ = tokio::time::timeout(Duration::from_secs(1), async {
                    while unsafe { libc::kill(-(runtime.process.pid as i32), 0) } == 0 {
                        tokio::time::sleep(Duration::from_millis(10)).await;
                    }
                }).await;
            }
        }
    }
}

impl Runtime {
    #[cfg(not(target_os = "android"))]
    async fn start(mut command: std::process::Command, home: &Path, library: &Path) -> Result<Self> {
        std::fs::create_dir_all(home)?;
        command
            .args(["serve", "--port", "0"])
            .env("LITFOLIO_CORE_HOST", "litfolio")
            .env("LITFOLIO_CORE_HOME", home)
            .env("LITFOLIO_CORE_LIBRARY", library)
            .env("PYTHONUNBUFFERED", "1")
            .env("PYTHONUTF8", "1")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            // Detailed Python diagnostics stay in LITFOLIO_CORE_HOME/core.log.
            .stderr(Stdio::null());
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            command.process_group(0);
        }
        let mut command = Command::from(command);
        command.kill_on_drop(true);
        let child = command.spawn().context("start bundled LitFolio backend")?;
        let pid = child.id().context("reading service PID missing")?;
        let mut process = ServiceProcess { child, pid };
        let stdout = process.child.stdout.take().context("reading service stdout missing")?;
        let mut lines = BufReader::new(stdout).lines();
        let url = tokio::time::timeout(Duration::from_secs(30), async {
            while let Some(line) = lines.next_line().await? {
                if let Some(address) = line.split_whitespace().find_map(|word| {
                    word.find("http://127.0.0.1:").map(|start| &word[start..])
                }) {
                    let parsed = url::Url::parse(address)?;
                    if parsed.scheme() == "http"
                        && parsed.host_str() == Some("127.0.0.1")
                        && parsed.port().is_some()
                        && parsed.path() == "/"
                    {
                        return Ok(address.trim_end_matches('/').to_owned());
                    }
                }
            }
            bail!("LitFolio exited before becoming ready; see {}/core.log", home.display())
        })
        .await
        .context("LitFolio startup timed out")??;
        // Drain subsequent output without logging private document contents.
        tauri::async_runtime::spawn(async move {
            while matches!(lines.next_line().await, Ok(Some(_))) {}
        });
        Self::connect(process, url).await
    }

    async fn connect(
        #[cfg(not(target_os = "android"))] process: ServiceProcess,
        #[cfg(target_os = "android")] plugin: android::AndroidReadingPlugin,
        url: String,
    ) -> Result<Self> {
        let http = reqwest::Client::builder()
            .no_proxy()
            .timeout(Duration::from_secs(15))
            .build()?;
        let session: LibrarySession = http
            .get(format!("{url}/api/library"))
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        Ok(Self {
            #[cfg(not(target_os = "android"))]
            process,
            #[cfg(target_os = "android")]
            plugin,
            url,
            token: session.token,
            http,
            documents: DocumentProjection::default(),
        })
    }

    async fn post(&self, path: &str, body: &impl Serialize) -> Result<reqwest::Response> {
        self.http
            .post(format!("{}{path}", self.url))
            .header("X-Token", &self.token)
            .json(body)
            .send()
            .await?
            .error_for_status()
            .with_context(|| format!("LitFolio {path} failed"))
    }

    async fn configure(&self, state: &AppState) -> Result<()> {
        let config = load_config(&state.paths)?;
        let profile = active_reading_profile(&config).ok();
        let profile = profile.map(|profile| serde_json::json!({
            "base_url": profile.base_url,
            "api_key": profile.api_key,
            "model": profile.chat_model,
            "api": "chat",
            "vision": false,
            "temperature": profile.temperature,
            "max_tokens": profile.max_tokens,
            "thinking_format": profile.thinking_format,
            "thinking_mode": profile.thinking_mode,
            "reasoning_effort": profile.reasoning_effort,
        }));
        self.post("/api/host/config", &serde_json::json!({ "profile": profile })).await?;
        Ok(())
    }

    async fn catalog(&self) -> Result<Catalog> {
        self.http.get(format!("{}/api/host/catalog", self.url))
            .header("X-Token", &self.token)
            .send().await?.error_for_status()?.json().await
            .context("read LitFolio catalog")
    }

    async fn project(&mut self, state: &AppState) -> Result<()> {
        let catalog = self.catalog().await?;
        project_reading_catalog(&state.pool, &catalog.items).await?;
        self.documents.project(&state.pool, &state.paths, &catalog.items).await?;
        Ok(())
    }

    async fn attach_missing(&self, state: &AppState, known: &HashSet<&str>, id: Option<&str>) -> Result<()> {
        if let Some(id) = id {
            if !known.contains(id) {
                let paper = PaperRepo::new(&state.pool).get(id).await?.context("paper not found")?;
                self.attach_legacy(state, &paper).await?;
            }
        } else {
            for paper in PaperRepo::new(&state.pool).list_all().await? {
                if !known.contains(paper.id.as_str()) {
                    self.attach_legacy(state, &paper).await?;
                }
            }
        }
        Ok(())
    }

    async fn import_files(&mut self, state: &AppState, paths: Vec<String>) -> Result<PdfImportSummary> {
        let result: ImportResult = self.post("/api/host/import", &serde_json::json!({ "paths": paths })).await?.json().await?;
        self.project(state).await?;
        let repo = PaperRepo::new(&state.pool);
        let mut imported = Vec::with_capacity(result.imported.len());
        for item in result.imported {
            imported.push(repo.get(&item.id).await?.context("imported paper missing from catalog")?);
        }
        log_pdf_import_summary("pdf_files", imported.len(), &result.failed);
        Ok(PdfImportSummary { imported, failed: result.failed })
    }

    async fn attach_legacy(&self, state: &AppState, paper: &Paper) -> Result<()> {
        let pdf = paper.pdf_path.as_deref()
            .map(|path| state.paths.ensure_inside_root(Path::new(path)))
            .transpose()?;
        let note = notes::read(&state.paths, &paper.id)?;
        let highlights = HighlightRepo::new(&state.pool).list_by_paper(&paper.id).await?;
        let pdf_notes = PdfNoteRepo::new(&state.pool).list_by_paper(&paper.id).await?;
        let tags = TagRepo::new(&state.pool).for_paper(&paper.id).await?;
        let body = HostPaper {
            id: &paper.id,
            title: &paper.title,
            authors: &paper.authors,
            year: paper.year,
            venue: &paper.venue,
            doi: &paper.doi,
            arxiv_id: &paper.arxiv_id,
            pdf_path: pdf.as_deref(),
            abstract_text: &paper.abstract_text,
            status: match paper.read_status {
                ReadStatus::Read => "done",
                ReadStatus::Reading => "reading",
                ReadStatus::Unread | ReadStatus::Must => "unread",
            },
            starred: paper.read_status == ReadStatus::Must,
            tags: tags.iter().map(|tag| tag.name.as_str()).collect(),
            added_at: paper.added_at,
            note: &note,
            highlights: highlights.iter().map(|h| LegacyHighlight {
                id: &h.id,
                page: h.page,
                text: &h.text,
                note: &h.note,
                color: &h.color,
                rect_json: &h.rect,
            }).collect(),
            pdf_notes: &pdf_notes,
        };
        let result: WorkspaceId = self.post("/api/host/paper", &body).await?.json().await?;
        if result.id != paper.id {
            bail!("LitFolio returned a different paper identity");
        }
        Ok(())
    }
}

#[cfg(all(test, not(target_os = "android")))]
mod original_title_test;

#[cfg(all(test, not(target_os = "android")))]
mod tests;
