use super::{EgressAttempt, EgressPhase, NetworkEgressObserver, REQUIRED_STARTUP_OBSERVERS};
use crate::commands;
use crate::startup;
use crate::storage::{Paper, PaperRepo, ReadStatus};
use crate::AppState;
use anyhow::{Context, Result};
use serde::Serialize;
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Manager, State, WebviewUrl};
use webkit2gtk::{URIRequestExt, WebViewExt};

const FIXTURE_PAPER_ID: &str = "startup-network-paper";
const CONTROL_BASE: &str = "http://203.0.113.1:9";
const HARNESS_CSP: &str = "default-src 'self'; script-src 'self' blob: http://203.0.113.1:*; style-src 'self' 'unsafe-inline' http://203.0.113.1:*; img-src 'self' asset: data: blob: http://203.0.113.1:*; media-src 'self' blob: http://203.0.113.1:*; connect-src 'self' ipc: http://ipc.localhost asset: http://asset.localhost http://203.0.113.1:* ws://203.0.113.1:*; worker-src 'self' blob:; child-src blob: http://203.0.113.1:*; frame-src http://203.0.113.1:*; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum HarnessMode {
    Zero,
    PositiveControls,
}

impl HarnessMode {
    fn from_env() -> Result<Self> {
        match std::env::var("LITFOLIO_STARTUP_NETWORK_MODE")
            .unwrap_or_else(|_| "zero".to_string())
            .as_str()
        {
            "zero" => Ok(Self::Zero),
            "positive-controls" => Ok(Self::PositiveControls),
            other => anyhow::bail!("unknown startup network harness mode: {other}"),
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Zero => "zero",
            Self::PositiveControls => "positive-controls",
        }
    }
}

#[derive(Debug)]
struct NativeAuditState {
    observer: NetworkEgressObserver,
    phase: Mutex<EgressPhase>,
    observed_phases: Mutex<Vec<EgressPhase>>,
    readiness: Mutex<Vec<String>>,
    report_path: PathBuf,
    scenario_id: String,
    included_plugins: Vec<String>,
    enabled_plugins: Vec<String>,
    mode: HarnessMode,
    idle_started: AtomicBool,
    finalized: AtomicBool,
}

impl NativeAuditState {
    fn from_env(observer: NetworkEgressObserver, mode: HarnessMode) -> Result<Self> {
        let scenario_id = std::env::var("LITFOLIO_STARTUP_NETWORK_SCENARIO")
            .context("LITFOLIO_STARTUP_NETWORK_SCENARIO is required")?;
        let report_path = PathBuf::from(
            std::env::var("LITFOLIO_STARTUP_NETWORK_REPORT")
                .context("LITFOLIO_STARTUP_NETWORK_REPORT is required")?,
        );
        let included_plugins = match scenario_id.as_str() {
            "core-only-cold-boot-and-idle" => Vec::new(),
            "updates-included-disabled-cold-boot-and-idle" => vec!["updates".to_string()],
            "startup-network-positive-controls" => vec!["updates".to_string()],
            other => anyhow::bail!("unknown startup network scenario: {other}"),
        };
        Ok(Self {
            observer,
            phase: Mutex::new(EgressPhase::ColdBoot),
            observed_phases: Mutex::new(vec![EgressPhase::ColdBoot]),
            readiness: Mutex::new(Vec::new()),
            report_path,
            scenario_id,
            included_plugins,
            enabled_plugins: Vec::new(),
            mode,
            idle_started: AtomicBool::new(false),
            finalized: AtomicBool::new(false),
        })
    }

    fn phase(&self) -> EgressPhase {
        *self.phase.lock().expect("startup phase lock poisoned")
    }

    fn set_phase(&self, phase: EgressPhase) {
        *self.phase.lock().expect("startup phase lock poisoned") = phase;
        let mut observed = self
            .observed_phases
            .lock()
            .expect("observed phases lock poisoned");
        if !observed.contains(&phase) {
            observed.push(phase);
        }
    }

    fn add_readiness(&self, milestone: &str) {
        let mut readiness = self.readiness.lock().expect("readiness lock poisoned");
        if !readiness.iter().any(|value| value == milestone) {
            readiness.push(milestone.to_string());
        }
    }

    fn has_readiness(&self, milestone: &str) -> bool {
        self.readiness
            .lock()
            .expect("readiness lock poisoned")
            .iter()
            .any(|value| value == milestone)
    }

    fn record(
        &self,
        observer: &str,
        phase: EgressPhase,
        operation: &str,
        destination: &str,
        correlation_id: &str,
    ) -> Result<(), String> {
        if !REQUIRED_STARTUP_OBSERVERS.contains(&observer) {
            return Err(format!("unknown startup observer: {observer}"));
        }
        self.observer.record(EgressAttempt {
            phase,
            owner: "core".to_string(),
            transport: observer.to_string(),
            operation: operation.to_string(),
            redacted_destination: redact_destination(destination),
            correlation_id: correlation_id.to_string(),
        });
        Ok(())
    }

    fn finish(&self, failure: Option<String>) -> Result<bool> {
        if self.finalized.swap(true, Ordering::SeqCst) {
            return Ok(false);
        }
        let attempts = self.observer.snapshot();
        let timer_count = attempts
            .iter()
            .filter(|attempt| attempt.transport == "scheduler.network-capable-timer")
            .count();
        let report = NativeAuditReport {
            scenario_id: self.scenario_id.clone(),
            mode: self.mode.as_str().to_string(),
            included_plugins: self.included_plugins.clone(),
            enabled_plugins: self.enabled_plugins.clone(),
            observer_coverage: REQUIRED_STARTUP_OBSERVERS
                .iter()
                .map(|value| (*value).to_string())
                .collect(),
            readiness_reached: self
                .readiness
                .lock()
                .expect("readiness lock poisoned")
                .clone(),
            observed_phases: self
                .observed_phases
                .lock()
                .expect("observed phases lock poisoned")
                .clone(),
            attempted_egress_count: attempts.len(),
            network_capable_timer_count: timer_count,
            attempts,
            failure,
        };
        if let Some(parent) = self.report_path.parent() {
            std::fs::create_dir_all(parent)
                .with_context(|| format!("create report directory {}", parent.display()))?;
        }
        std::fs::write(&self.report_path, serde_json::to_vec_pretty(&report)?)
            .with_context(|| format!("write startup report {}", self.report_path.display()))?;
        Ok(true)
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeAuditReport {
    scenario_id: String,
    mode: String,
    included_plugins: Vec<String>,
    enabled_plugins: Vec<String>,
    observer_coverage: Vec<String>,
    readiness_reached: Vec<String>,
    observed_phases: Vec<EgressPhase>,
    attempted_egress_count: usize,
    network_capable_timer_count: usize,
    attempts: Vec<EgressAttempt>,
    failure: Option<String>,
}

#[tauri::command]
fn startup_network_audit_record(
    state: State<'_, Arc<NativeAuditState>>,
    observer: String,
    phase: String,
    operation: String,
    destination: String,
    control_id: Option<String>,
) -> Result<(), String> {
    state.record(
        &observer,
        parse_phase(&phase)?,
        &operation,
        &destination,
        control_id.as_deref().unwrap_or("startup-runtime-attempt"),
    )
}

#[tauri::command]
fn startup_network_audit_milestone(
    app: AppHandle,
    state: State<'_, Arc<NativeAuditState>>,
    milestone: String,
) -> Result<(), String> {
    match milestone.as_str() {
        "library-ready" => {
            state.set_phase(EgressPhase::Readiness);
            state.add_readiness(&milestone);
        }
        "reader-pdf-ready" => {
            state.add_readiness(&milestone);
            if state.mode == HarnessMode::Zero
                && state.has_readiness("library-ready")
                && !state.idle_started.swap(true, Ordering::SeqCst)
            {
                state.set_phase(EgressPhase::Idle);
                let audit = state.inner().clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(Duration::from_secs(30)).await;
                    match audit.finish(None) {
                        Ok(true) => app.exit(0),
                        Ok(false) => {}
                        Err(error) => {
                            eprintln!("startup network report failed: {error:#}");
                            app.exit(4);
                        }
                    }
                });
            }
        }
        _ => return Err(format!("unknown readiness milestone: {milestone}")),
    }
    Ok(())
}

#[tauri::command]
async fn startup_network_audit_backend_control(
    state: State<'_, Arc<NativeAuditState>>,
    app_state: State<'_, Arc<AppState>>,
    observer: String,
) -> Result<(), String> {
    match observer.as_str() {
        "backend.api-client" => {
            state.record(
                &observer,
                EgressPhase::ColdBoot,
                "GET",
                &format!("{CONTROL_BASE}/api-client"),
                "backend-denied-api-client",
            )?;
            let _ = app_state
                .http
                .get(format!("{CONTROL_BASE}/api-client"))
                .timeout(Duration::from_secs(2))
                .send()
                .await;
        }
        "backend.external-client" => {
            state.record(
                &observer,
                EgressPhase::Readiness,
                "GET",
                &format!("{CONTROL_BASE}/external-client"),
                "backend-denied-external-client",
            )?;
            let _ = app_state
                .http_external
                .get(format!("{CONTROL_BASE}/external-client"))
                .timeout(Duration::from_secs(2))
                .send()
                .await;
        }
        "host.network-adapter" => {
            let _ = app_state.host_network.attempt(EgressAttempt {
                phase: EgressPhase::Idle,
                owner: "core".to_string(),
                transport: observer,
                operation: "network.request".to_string(),
                redacted_destination: redact_destination(&format!("{CONTROL_BASE}/host-adapter")),
                correlation_id: "backend-denied-host-request".to_string(),
            });
        }
        "scheduler.network-capable-timer" => {
            state.record(
                &observer,
                EgressPhase::Idle,
                "schedule.register",
                "timer://network-capable/<redacted>",
                "scheduler-denied-network-capable-timer",
            )?;
        }
        _ => return Err(format!("unknown backend positive control: {observer}")),
    }
    Ok(())
}

#[tauri::command]
fn startup_network_audit_finish_positive(
    app: AppHandle,
    state: State<'_, Arc<NativeAuditState>>,
) -> Result<(), String> {
    state.set_phase(EgressPhase::Idle);
    state
        .finish(None)
        .map_err(|error| format!("write positive-control report: {error:#}"))?;
    app.exit(0);
    Ok(())
}

#[tauri::command]
fn startup_network_audit_fail(
    app: AppHandle,
    state: State<'_, Arc<NativeAuditState>>,
    message: String,
) -> Result<(), String> {
    state
        .finish(Some(message))
        .map_err(|error| format!("write failed startup report: {error:#}"))?;
    app.exit(3);
    Ok(())
}

pub fn run_native_startup_network_harness() -> Result<i32> {
    let mode = HarnessMode::from_env()?;
    let observer = NetworkEgressObserver::default();
    let audit = Arc::new(NativeAuditState::from_env(observer.clone(), mode)?);
    let library_root = PathBuf::from(
        std::env::var("LITFOLIO_STARTUP_NETWORK_LIBRARY")
            .context("LITFOLIO_STARTUP_NETWORK_LIBRARY is required")?,
    );

    let init_script = format!(
        "window.__LITFOLIO_STARTUP_NETWORK_MODE__ = {};\n{}",
        serde_json::to_string(mode.as_str())?,
        include_str!("startup_network_audit.js")
    );
    let audit_for_navigation = audit.clone();
    let audit_for_setup = audit.clone();
    let audit_for_run = audit.clone();
    let mut context = tauri::generate_context!();
    context.config_mut().app.windows.clear();
    context.config_mut().app.security.csp =
        Some(tauri::utils::config::Csp::Policy(HARNESS_CSP.to_string()));

    let audit_plugin = tauri::plugin::Builder::<tauri::Wry>::new("startup-network-audit")
        .js_init_script(init_script)
        .build();

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init());
    // The updater transport is compiled into the artifact for the positive
    // controls and for the updates-included-disabled scenario (included but
    // never activated). Core-only zero mode omits it entirely.
    let include_updater = match mode {
        HarnessMode::PositiveControls => true,
        HarnessMode::Zero => audit.scenario_id == "updates-included-disabled-cold-boot-and-idle",
    };
    if include_updater {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    let app = builder
        .plugin(audit_plugin)
        .invoke_handler(crate::commands::command_paths_core!([
            startup_network_audit_record,
            startup_network_audit_milestone,
            startup_network_audit_backend_control,
            startup_network_audit_finish_positive,
            startup_network_audit_fail,
        ]))
        .setup(move |app| {
            let state = tauri::async_runtime::block_on(startup::bootstrap_state_at_with_observer(
                &library_root,
                observer.clone(),
            ))?;
            tauri::async_runtime::block_on(seed_reader_fixture(&state))?;
            app.asset_protocol_scope()
                .allow_directory(&library_root, true)?;
            app.manage(state);
            app.manage(audit_for_setup.clone());

            let navigation_audit = audit_for_navigation.clone();
            let webview = tauri::WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::App("index.html".into()),
            )
            .title("LitFolio startup network audit")
            .inner_size(1320.0, 860.0)
            .visible(true)
            .on_navigation(move |url| observe_navigation(&navigation_audit, url))
            .build()?;

            let resource_audit = audit_for_setup.clone();
            webview.with_webview(move |platform_webview| {
                platform_webview.inner().connect_resource_load_started(
                    move |_view, _resource, request| {
                        let Some(uri) = request.uri() else {
                            return;
                        };
                        observe_webview_resource(&resource_audit, uri.as_str());
                    },
                );
            })?;

            let watchdog_audit = audit_for_setup.clone();
            let watchdog_app = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(Duration::from_secs(120)).await;
                if let Ok(true) = watchdog_audit.finish(Some(
                    "native startup network harness timed out before completion".to_string(),
                )) {
                    watchdog_app.exit(5);
                }
            });
            Ok(())
        })
        .build(context)?;

    Ok(app.run_return(move |_, event| {
        if let tauri::RunEvent::ExitRequested { api, .. } = event {
            if !audit_for_run.finalized.load(Ordering::SeqCst) {
                api.prevent_exit();
            }
        }
    }))
}

async fn seed_reader_fixture(state: &Arc<AppState>) -> Result<()> {
    let paper_dir = state.paths.paper_dir(FIXTURE_PAPER_ID);
    std::fs::create_dir_all(&paper_dir)
        .with_context(|| format!("create fixture paper directory {}", paper_dir.display()))?;
    let pdf_path = paper_dir.join("original.pdf");
    write_minimal_pdf(&pdf_path)?;
    let now = chrono::Utc::now().timestamp();
    PaperRepo::new(&state.pool)
        .insert(&Paper {
            id: FIXTURE_PAPER_ID.to_string(),
            title: "Startup Network Readiness Paper".to_string(),
            authors: vec!["LitFolio Audit".to_string()],
            year: Some(2026),
            venue: Some("Local fixture".to_string()),
            doi: None,
            arxiv_id: None,
            abstract_text: Some("Local PDF fixture for startup readiness.".to_string()),
            pdf_path: Some(pdf_path.display().to_string()),
            note_path: None,
            added_at: now,
            updated_at: now,
            read_status: ReadStatus::Unread,
            tldr: None,
            research_question: None,
            method: None,
            dataset: None,
            key_findings: Vec::new(),
            limitations: None,
            comparison: None,
            title_translated: None,
            abstract_translated: None,
            translate_target_lang: None,
            translated_at: None,
            bibtex: None,
            last_exported_at: None,
        })
        .await
        .context("insert startup readiness paper")?;
    Ok(())
}

fn write_minimal_pdf(path: &Path) -> Result<()> {
    let stream = "BT /F1 24 Tf 72 720 Td (LitFolio startup readiness) Tj ET";
    let objects = [
        "<< /Type /Catalog /Pages 2 0 R >>".to_string(),
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>".to_string(),
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>".to_string(),
        format!("<< /Length {} >>\nstream\n{stream}\nendstream", stream.len()),
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>".to_string(),
    ];
    let mut pdf = b"%PDF-1.4\n".to_vec();
    let mut offsets = Vec::with_capacity(objects.len());
    for (index, object) in objects.iter().enumerate() {
        offsets.push(pdf.len());
        pdf.extend_from_slice(format!("{} 0 obj\n{}\nendobj\n", index + 1, object).as_bytes());
    }
    let xref_offset = pdf.len();
    pdf.extend_from_slice(format!("xref\n0 {}\n", objects.len() + 1).as_bytes());
    pdf.extend_from_slice(b"0000000000 65535 f \n");
    for offset in offsets {
        pdf.extend_from_slice(format!("{offset:010} 00000 n \n").as_bytes());
    }
    pdf.extend_from_slice(
        format!(
            "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n",
            objects.len() + 1
        )
        .as_bytes(),
    );
    std::fs::write(path, pdf).with_context(|| format!("write fixture PDF {}", path.display()))
}

fn observe_navigation(audit: &NativeAuditState, url: &tauri::Url) -> bool {
    if !is_external(url.as_str()) {
        return true;
    }
    let control_id = control_id(url.as_str());
    if control_id.as_deref() == Some("webview-denied-frame-request") {
        return true;
    }
    let correlation_id = control_id
        .as_deref()
        .unwrap_or("webview-runtime-navigation");
    let phase = control_id
        .as_deref()
        .map(control_phase)
        .unwrap_or_else(|| audit.phase());
    let _ = audit.record(
        "webview.process-navigation",
        phase,
        "navigate",
        url.as_str(),
        correlation_id,
    );
    false
}

fn observe_webview_resource(audit: &NativeAuditState, uri: &str) {
    if !is_external(uri) {
        return;
    }
    let id = control_id(uri);
    let observer = match id.as_deref() {
        Some("webview-denied-image-request") => "webview.process-image-request",
        Some("webview-denied-style-request") => "webview.process-style-request",
        Some("webview-denied-media-request") => "webview.process-media-request",
        Some("webview-denied-frame-request") => "webview.process-frame-request",
        Some("webview-denied-worker-request") => "webview.process-worker-request",
        _ => classify_resource_observer(uri),
    };
    let correlation_id = id.as_deref().unwrap_or("webview-runtime-resource");
    let phase = id
        .as_deref()
        .map(control_phase)
        .unwrap_or_else(|| audit.phase());
    let _ = audit.record(observer, phase, "resource.load", uri, correlation_id);
}

fn classify_resource_observer(uri: &str) -> &'static str {
    let path = uri.split('?').next().unwrap_or(uri).to_ascii_lowercase();
    if path.ends_with(".css") {
        "webview.process-style-request"
    } else if path.ends_with(".mp3") || path.ends_with(".mp4") || path.ends_with(".webm") {
        "webview.process-media-request"
    } else if path.ends_with(".html") {
        "webview.process-frame-request"
    } else if path.ends_with(".js") || path.ends_with(".mjs") {
        "webview.process-worker-request"
    } else {
        "webview.process-image-request"
    }
}

fn parse_phase(value: &str) -> Result<EgressPhase, String> {
    match value {
        "cold-boot" => Ok(EgressPhase::ColdBoot),
        "readiness" => Ok(EgressPhase::Readiness),
        "idle" => Ok(EgressPhase::Idle),
        _ => Err(format!("unknown startup phase: {value}")),
    }
}

fn control_phase(control_id: &str) -> EgressPhase {
    match control_id {
        "frontend-denied-fetch"
        | "updater-denied-check"
        | "backend-denied-api-client"
        | "webview-denied-navigation" => EgressPhase::ColdBoot,
        "frontend-denied-xml-http-request"
        | "frontend-denied-web-socket"
        | "frontend-denied-event-source"
        | "backend-denied-external-client"
        | "webview-denied-image-request"
        | "webview-denied-style-request"
        | "webview-denied-media-request"
        | "webview-denied-frame-request"
        | "webview-csp-denied-attempt" => EgressPhase::Readiness,
        _ => EgressPhase::Idle,
    }
}

fn control_id(destination: &str) -> Option<String> {
    tauri::Url::parse(destination).ok().and_then(|url| {
        url.query_pairs()
            .find(|(key, _)| key == "controlId")
            .map(|(_, value)| value.into_owned())
    })
}

fn is_external(destination: &str) -> bool {
    tauri::Url::parse(destination).ok().is_some_and(|url| {
        matches!(url.scheme(), "http" | "https" | "ws" | "wss")
            && url.host_str() != Some("tauri.localhost")
            && url.host_str() != Some("ipc.localhost")
            && url.host_str() != Some("asset.localhost")
    })
}

fn redact_destination(destination: &str) -> String {
    let Ok(url) = tauri::Url::parse(destination) else {
        return "<redacted>".to_string();
    };
    if url.scheme() == "timer" {
        return "timer://network-capable/<redacted>".to_string();
    }
    let Some(host) = url.host_str() else {
        return format!("{}:<redacted>", url.scheme());
    };
    let port = url
        .port()
        .map(|value| format!(":{value}"))
        .unwrap_or_default();
    format!("{}://{host}{port}/<redacted>", url.scheme())
}

#[allow(dead_code)]
fn fixture_observer_set() -> BTreeSet<&'static str> {
    REQUIRED_STARTUP_OBSERVERS.into_iter().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fixture_pdf_has_a_valid_xref() {
        let dir = std::env::temp_dir().join(format!("litera-minimal-pdf-{}", ulid::Ulid::new()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("fixture.pdf");
        write_minimal_pdf(&path).unwrap();
        let bytes = std::fs::read(&path).unwrap();
        assert!(bytes.starts_with(b"%PDF-1.4"));
        assert!(bytes.windows(5).any(|window| window == b"xref\n"));
        std::fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn startup_observer_catalog_matches_fixture_contract() {
        assert_eq!(fixture_observer_set().len(), 17);
        assert!(fixture_observer_set().contains("tauri.updater"));
        assert!(fixture_observer_set().contains("webview.csp-denied-attempt"));
    }

    #[test]
    fn destinations_are_redacted_before_reports() {
        assert_eq!(
            redact_destination("https://example.test/private?q=secret"),
            "https://example.test/<redacted>"
        );
    }
}
