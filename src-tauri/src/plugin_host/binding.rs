//! Opaque instance bindings and the reference monitor.
//!
//! A plugin never receives capability state — only an opaque
//! [`InstanceBinding`] the host issued at activation. Every privileged call
//! goes through [`PluginHostState::authorize`], which denies:
//! - **forged** bindings (ids the host never issued),
//! - **stale** bindings (generation older than the live instance after a
//!   disable/re-enable cycle),
//! - operations outside the manifest-granted set.
//!
//! Disable revokes the binding BEFORE any cleanup or persistence, so late
//! results carrying a revoked binding can never resurface.

use std::collections::{BTreeSet, HashMap};

use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstanceBinding {
    /// Host-issued opaque handle. Random per activation; carries no authority
    /// by itself.
    pub binding_id: String,
    pub plugin_id: String,
    pub generation: u64,
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum HostAccessError {
    #[error("forged-binding")]
    ForgedBinding,
    #[error("stale-generation")]
    StaleGeneration,
    #[error("capability-denied")]
    CapabilityDenied,
}

impl HostAccessError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::ForgedBinding => "forged-binding",
            Self::StaleGeneration => "stale-generation",
            Self::CapabilityDenied => "capability-denied",
        }
    }
}

#[derive(Default)]
pub struct PluginHostState {
    /// Every binding ever issued, keyed by opaque id. Dead bindings stay as
    /// provenance so "stale" can be distinguished from "forged".
    records: tokio::sync::Mutex<HashMap<String, BindingRecord>>,
}

struct BindingRecord {
    plugin_id: String,
    generation: u64,
    operations: BTreeSet<String>,
    /// Authority flag: false once revoked or superseded.
    live: bool,
}

fn new_binding_id(plugin_id: &str, generation: u64) -> String {
    let suffix = ulid::Ulid::new();
    format!("bind-{plugin_id}-{generation}-{suffix}")
}

impl PluginHostState {
    pub fn new() -> Self {
        Self::default()
    }

    /// Issue a fresh binding for one activation. Any previous binding for the
    /// same plugin is marked dead first — only the newest generation is live.
    pub async fn issue(
        &self,
        plugin_id: &str,
        generation: u64,
        operations: BTreeSet<String>,
    ) -> InstanceBinding {
        let mut records = self.records.lock().await;
        for rec in records.values_mut() {
            if rec.plugin_id == plugin_id {
                rec.live = false;
            }
        }
        let binding = InstanceBinding {
            binding_id: new_binding_id(plugin_id, generation),
            plugin_id: plugin_id.to_string(),
            generation,
        };
        records.insert(
            binding.binding_id.clone(),
            BindingRecord {
                plugin_id: plugin_id.to_string(),
                generation,
                operations,
                live: true,
            },
        );
        binding
    }

    /// Kill every live binding for a plugin. Called on disable BEFORE
    /// cleanup/persistence; afterwards all authority is gone.
    pub async fn revoke(&self, plugin_id: &str) {
        let mut records = self.records.lock().await;
        for rec in records.values_mut() {
            if rec.plugin_id == plugin_id {
                rec.live = false;
            }
        }
    }

    /// Reference monitor: the only path from a binding to a privileged
    /// operation. Deny-by-default.
    pub async fn authorize(
        &self,
        binding: &InstanceBinding,
        operation: &str,
    ) -> Result<(), HostAccessError> {
        let records = self.records.lock().await;
        let Some(rec) = records.get(&binding.binding_id) else {
            return Err(HostAccessError::ForgedBinding);
        };
        if rec.plugin_id != binding.plugin_id || rec.generation != binding.generation {
            return Err(HostAccessError::ForgedBinding);
        }
        if !rec.live {
            return Err(HostAccessError::StaleGeneration);
        }
        if !rec.operations.contains(operation) {
            return Err(HostAccessError::CapabilityDenied);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ops(items: &[&str]) -> BTreeSet<String> {
        items.iter().map(|s| s.to_string()).collect()
    }

    #[tokio::test]
    async fn forged_binding_is_denied() {
        let host = PluginHostState::new();
        let forged = InstanceBinding {
            binding_id: "bind-not-issued".into(),
            plugin_id: "fixture-local".into(),
            generation: 1,
        };
        assert_eq!(
            host.authorize(&forged, "papers.search").await,
            Err(HostAccessError::ForgedBinding)
        );
    }

    #[tokio::test]
    async fn stale_generation_denied_after_reenable() {
        let host = PluginHostState::new();
        let first = host.issue("fixture-local", 1, ops(&["papers.search"])).await;
        host.revoke("fixture-local").await;
        // Re-enable bumps the generation; the old binding must not resurface.
        let _second = host.issue("fixture-local", 2, ops(&["papers.search"])).await;
        assert_eq!(
            host.authorize(&first, "papers.search").await,
            Err(HostAccessError::StaleGeneration)
        );
    }

    #[tokio::test]
    async fn operation_outside_grant_is_denied() {
        let host = PluginHostState::new();
        let binding = host.issue("fixture-local", 1, ops(&["papers.search"])).await;
        assert!(host.authorize(&binding, "papers.search").await.is_ok());
        assert_eq!(
            host.authorize(&binding, "annotations.write").await,
            Err(HostAccessError::CapabilityDenied)
        );
    }

    #[tokio::test]
    async fn reissue_revokes_previous_binding_of_same_plugin() {
        let host = PluginHostState::new();
        let first = host.issue("a", 1, ops(&["papers.search"])).await;
        host.issue("a", 2, ops(&["papers.search"])).await;
        assert_eq!(
            host.authorize(&first, "papers.search").await,
            Err(HostAccessError::StaleGeneration)
        );
    }

    #[tokio::test]
    async fn revoke_kills_authority_immediately() {
        let host = PluginHostState::new();
        let binding = host.issue("fixture-local", 1, ops(&["papers.search"])).await;
        host.revoke("fixture-local").await;
        assert_eq!(
            host.authorize(&binding, "papers.search").await,
            Err(HostAccessError::StaleGeneration)
        );
    }
}
