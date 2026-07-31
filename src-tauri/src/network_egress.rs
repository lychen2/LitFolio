//! Observation boundary for backend network attempts.
//!
//! Request owners call this before transport dispatch, including when policy
//! denies the request. Production request adapters will be connected by the
//! later plugin-host work; this value does not itself grant network access.

use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

#[cfg(target_os = "linux")]
mod native_harness;

#[cfg(target_os = "linux")]
pub use native_harness::run_native_startup_network_harness;

pub const REQUIRED_STARTUP_OBSERVERS: [&str; 17] = [
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum EgressPhase {
    ColdBoot,
    Readiness,
    Idle,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EgressAttempt {
    pub phase: EgressPhase,
    pub owner: String,
    pub transport: String,
    pub operation: String,
    pub redacted_destination: String,
    pub correlation_id: String,
}

#[derive(Debug, Clone, Default)]
pub struct NetworkEgressObserver {
    attempts: Arc<Mutex<Vec<EgressAttempt>>>,
}

impl NetworkEgressObserver {
    pub fn record(&self, attempt: EgressAttempt) {
        self.attempts
            .lock()
            .expect("network egress observer lock poisoned")
            .push(attempt);
    }

    pub fn snapshot(&self) -> Vec<EgressAttempt> {
        self.attempts
            .lock()
            .expect("network egress observer lock poisoned")
            .clone()
    }

    pub fn attempt_count(&self) -> usize {
        self.attempts
            .lock()
            .expect("network egress observer lock poisoned")
            .len()
    }
}

#[derive(Debug, Clone)]
pub struct HostNetworkState {
    denied: DeniedHostRequestAdapter,
    observer: NetworkEgressObserver,
}

impl HostNetworkState {
    pub fn new(observer: NetworkEgressObserver) -> Self {
        Self {
            denied: DeniedHostRequestAdapter::new(observer.clone()),
            observer,
        }
    }

    pub fn observer(&self) -> &NetworkEgressObserver {
        &self.observer
    }

    pub fn attempt(&self, attempt: EgressAttempt) -> Result<(), HostRequestDenied> {
        self.denied.attempt(attempt)
    }
}

/// Denied adapter used to prove that observation happens before dispatch.
#[derive(Debug, Clone)]
pub struct DeniedHostRequestAdapter {
    observer: NetworkEgressObserver,
}

impl DeniedHostRequestAdapter {
    pub fn new(observer: NetworkEgressObserver) -> Self {
        Self { observer }
    }

    pub fn attempt(&self, attempt: EgressAttempt) -> Result<(), HostRequestDenied> {
        self.observer.record(attempt);
        Err(HostRequestDenied)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
#[error("host network request denied")]
pub struct HostRequestDenied;
