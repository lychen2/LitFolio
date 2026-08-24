#![cfg(target_os = "linux")]

use serde::Deserialize;
use std::collections::BTreeSet;
use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;

/// The harness scenarios launch real WebKitGTK processes under xvfb/unshare.
/// Two instances running concurrently race on shared WebKit data directories,
/// so the two process-level tests are serialized through one mutex. Each test
/// must hold the gate for its entire subprocess run.
static PROCESS_GATE: Mutex<()> = Mutex::new(());
const REQUIRED_OBSERVERS: [&str; 17] = [
    "frontend.fetch",
    "frontend.xml-http-request",
    "frontend.web-socket",
    "frontend.event-source",
    "frontend.send-beacon",
    "tauri.updater",
    "backend.api-client",
    "backend.external-client",
    "host.network-adapter",
    "scheduler.network-capable-timer",
    "webview.process-image-request",
    "webview.process-style-request",
    "webview.process-media-request",
    "webview.process-frame-request",
    "webview.process-worker-request",
    "webview.process-navigation",
    "webview.csp-denied-attempt",
];

const POSITIVE_CONTROLS: [(&str, &str, &str); 17] = [
    ("frontend-denied-fetch", "frontend.fetch", "cold-boot"),
    (
        "frontend-denied-xml-http-request",
        "frontend.xml-http-request",
        "readiness",
    ),
    (
        "frontend-denied-web-socket",
        "frontend.web-socket",
        "readiness",
    ),
    (
        "frontend-denied-event-source",
        "frontend.event-source",
        "readiness",
    ),
    (
        "frontend-denied-send-beacon",
        "frontend.send-beacon",
        "idle",
    ),
    ("updater-denied-check", "tauri.updater", "cold-boot"),
    (
        "backend-denied-api-client",
        "backend.api-client",
        "cold-boot",
    ),
    (
        "backend-denied-external-client",
        "backend.external-client",
        "readiness",
    ),
    (
        "backend-denied-host-request",
        "host.network-adapter",
        "idle",
    ),
    (
        "scheduler-denied-network-capable-timer",
        "scheduler.network-capable-timer",
        "idle",
    ),
    (
        "webview-denied-image-request",
        "webview.process-image-request",
        "readiness",
    ),
    (
        "webview-denied-style-request",
        "webview.process-style-request",
        "readiness",
    ),
    (
        "webview-denied-media-request",
        "webview.process-media-request",
        "readiness",
    ),
    (
        "webview-denied-frame-request",
        "webview.process-frame-request",
        "readiness",
    ),
    (
        "webview-denied-worker-request",
        "webview.process-worker-request",
        "idle",
    ),
    (
        "webview-denied-navigation",
        "webview.process-navigation",
        "cold-boot",
    ),
    (
        "webview-csp-denied-attempt",
        "webview.csp-denied-attempt",
        "readiness",
    ),
];

const PROCESS_RESOURCE_CONTROLS: [(&str, u16); 5] = [
    ("webview-denied-image-request", 19001),
    ("webview-denied-style-request", 19002),
    ("webview-denied-media-request", 19003),
    ("webview-denied-frame-request", 19004),
    ("webview-denied-worker-request", 19005),
];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeAuditReport {
    scenario_id: String,
    mode: String,
    included_plugins: Vec<String>,
    enabled_plugins: Vec<String>,
    observer_coverage: Vec<String>,
    readiness_reached: Vec<String>,
    observed_phases: Vec<String>,
    attempted_egress_count: usize,
    network_capable_timer_count: usize,
    attempts: Vec<ObservedAttempt>,
    failure: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ObservedAttempt {
    phase: String,
    transport: String,
    correlation_id: String,
}

struct ScenarioArtifacts {
    report: NativeAuditReport,
    process_network_attempts: Vec<String>,
    work_dir: PathBuf,
    library_root: PathBuf,
}

impl Drop for ScenarioArtifacts {
    fn drop(&mut self) {
        std::fs::remove_dir_all(&self.work_dir).ok();
        std::fs::remove_dir_all(&self.library_root).ok();
    }
}

#[test]
fn core_boot_without_plugins_has_no_network_requests() {
    let _gate = PROCESS_GATE.lock().expect("startup network process gate");
    let zero = run_native_scenario("core-only-cold-boot-and-idle", "zero");
    assert_zero_scenario(&zero, &[]);

    let controls = run_native_scenario("startup-network-positive-controls", "positive-controls");
    assert_eq!(controls.report.mode, "positive-controls");
    assert_eq!(controls.report.failure, None);
    assert_eq!(
        controls.report.observer_coverage,
        REQUIRED_OBSERVERS.map(str::to_string)
    );
    for (control_id, observer, phase) in POSITIVE_CONTROLS {
        let matches = controls
            .report
            .attempts
            .iter()
            .filter(|attempt| {
                attempt.correlation_id == control_id
                    && attempt.transport == observer
                    && attempt.phase == phase
            })
            .count();
        assert!(
            matches >= 1,
            "positive control {control_id} did not reach {observer} in {phase}; attempts: {:#?}",
            controls.report.attempts
        );
    }
    for (control_id, port) in PROCESS_RESOURCE_CONTROLS {
        let port_marker = format!("sin_port=htons({port})");
        assert!(
            controls
                .process_network_attempts
                .iter()
                .any(|line| line.contains(&port_marker)),
            "process syscall observer missed {control_id} on port {port}: {:#?}",
            controls.process_network_attempts
        );
    }
    assert_eq!(controls.report.network_capable_timer_count, 1);
    assert!(
        !controls.process_network_attempts.is_empty(),
        "process syscall observer missed all positive-control network attempts"
    );
    assert!(
        controls
            .process_network_attempts
            .iter()
            .any(|line| line.contains("203.0.113.1")),
        "process syscall observer missed the external sentinel: {:#?}",
        controls.process_network_attempts
    );
}

#[test]
fn disabled_update_plugin_has_no_timer_or_network_request() {
    let _gate = PROCESS_GATE.lock().expect("startup network process gate");
    let zero = run_native_scenario("updates-included-disabled-cold-boot-and-idle", "zero");
    assert_zero_scenario(&zero, &["updates"]);
}

fn assert_zero_scenario(artifacts: &ScenarioArtifacts, included_plugins: &[&str]) {
    assert_eq!(artifacts.report.mode, "zero");
    assert_eq!(artifacts.report.failure, None);
    assert_eq!(artifacts.report.scenario_id, scenario_for(included_plugins));
    assert_eq!(
        artifacts.report.included_plugins,
        included_plugins
            .iter()
            .map(|value| (*value).to_string())
            .collect::<Vec<_>>()
    );
    assert!(artifacts.report.enabled_plugins.is_empty());
    assert_eq!(
        artifacts.report.observer_coverage,
        REQUIRED_OBSERVERS.map(str::to_string)
    );
    assert_eq!(
        artifacts
            .report
            .readiness_reached
            .iter()
            .map(String::as_str)
            .collect::<BTreeSet<_>>(),
        BTreeSet::from(["library-ready", "reader-pdf-ready"])
    );
    assert_eq!(
        artifacts
            .report
            .observed_phases
            .iter()
            .map(String::as_str)
            .collect::<BTreeSet<_>>(),
        BTreeSet::from(["cold-boot", "readiness", "idle"])
    );
    assert_eq!(
        artifacts.report.attempted_egress_count, 0,
        "startup observers recorded egress: {:#?}",
        artifacts.report.attempts
    );
    assert_eq!(artifacts.report.network_capable_timer_count, 0);
    assert!(artifacts.report.attempts.is_empty());
    assert!(
        artifacts.process_network_attempts.is_empty(),
        "process-wide network attempts escaped app observers: {:#?}",
        artifacts.process_network_attempts
    );
}

fn scenario_for(included_plugins: &[&str]) -> &'static str {
    if included_plugins.is_empty() {
        "core-only-cold-boot-and-idle"
    } else {
        "updates-included-disabled-cold-boot-and-idle"
    }
}

fn run_native_scenario(scenario: &str, mode: &str) -> ScenarioArtifacts {
    require_tool("unshare", "--version");
    require_tool("xvfb-run", "--help");
    require_tool("strace", "--version");

    let id = ulid::Ulid::new().to_string();
    let work_dir = std::env::temp_dir().join(format!("litera-startup-network-{id}"));
    std::fs::create_dir_all(&work_dir).expect("create startup network work directory");
    let home = dirs::home_dir().expect("home directory is available");
    let library_root = home
        .join("Litera-Library")
        .join(format!(".startup-network-audit-{id}"));
    let report_path = work_dir.join("report.json");
    let trace_prefix = work_dir.join("network.trace");
    let litera_binary = PathBuf::from(env!("CARGO_BIN_EXE_litera"));

    let output = Command::new("unshare")
        .args(["--user", "--map-root-user", "--net"])
        .arg("xvfb-run")
        .args(["-a", "strace", "-ff", "-qq", "-s", "512"])
        .args(["-e", "trace=network", "-o"])
        .arg(&trace_prefix)
        .arg(&litera_binary)
        .env("LITFOLIO_STARTUP_NETWORK_HARNESS", "1")
        .env("LITFOLIO_STARTUP_NETWORK_SCENARIO", scenario)
        .env("LITFOLIO_STARTUP_NETWORK_MODE", mode)
        .env("LITFOLIO_STARTUP_NETWORK_REPORT", &report_path)
        .env("LITFOLIO_STARTUP_NETWORK_LIBRARY", &library_root)
        .env("WEBKIT_DISABLE_COMPOSITING_MODE", "1")
        .output()
        .expect("spawn isolated native Tauri startup harness");

    assert!(
        output.status.success(),
        "native startup harness failed for {scenario}/{mode}\nstatus: {}\nstdout:\n{}\nstderr:\n{}",
        output.status,
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    let report_bytes = std::fs::read(&report_path).unwrap_or_else(|error| {
        panic!(
            "read native startup report {}: {error}\nstdout:\n{}\nstderr:\n{}",
            report_path.display(),
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        )
    });
    let report = serde_json::from_slice(&report_bytes).expect("parse native startup report");
    let process_network_attempts = process_network_attempts(&trace_prefix);
    ScenarioArtifacts {
        report,
        process_network_attempts,
        work_dir,
        library_root,
    }
}

fn process_network_attempts(trace_prefix: &Path) -> Vec<String> {
    let directory = trace_prefix.parent().expect("trace prefix has parent");
    let prefix = trace_prefix
        .file_name()
        .and_then(OsStr::to_str)
        .expect("trace prefix is UTF-8");
    let mut attempts = Vec::new();
    for entry in std::fs::read_dir(directory).expect("read trace directory") {
        let entry = entry.expect("read trace entry");
        let name = entry.file_name();
        let Some(name) = name.to_str() else {
            continue;
        };
        if !name.starts_with(prefix) {
            continue;
        }
        let trace = std::fs::read_to_string(entry.path()).expect("read strace output");
        attempts.extend(trace.lines().filter_map(|line| {
            let egress_syscall = line.contains("connect(")
                || line.contains("sendto(")
                || line.contains("sendmsg(")
                || line.contains("sendmmsg(");
            let internet_address = line.contains("AF_INET") || line.contains("AF_INET6");
            (egress_syscall && internet_address).then(|| line.to_string())
        }));
    }
    attempts.sort();
    attempts
}

fn require_tool(tool: &str, version_arg: &str) {
    let status = Command::new(tool)
        .arg(version_arg)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .unwrap_or_else(|error| {
            panic!("{tool} is required for process-wide startup tests: {error}")
        });
    assert!(status.success(), "{tool} is not usable in this environment");
}
