//! Plugin host foundation.
//!
//! Owns the authority boundary between core and plugins:
//! - [`registry`] — the compiled-in canonical manifest set (single source:
//!   `plugins/<id>/manifest.json`).
//! - [`binding`] — opaque instance bindings plus the reference monitor that
//!   gates every privileged operation.
//!
//! Fresh installs (no persisted `plugin_state` row) enable only the hot-topic
//! tracking + reading loop: `discovery-feeds` and `candidate-inbox`. All
//! knowledge-base/management plugins default to disabled by design.
//!
//! Lifecycle rule: enable bumps the persisted generation and issues a fresh
//! binding; disable revokes the binding BEFORE persistence/cleanup, so late
//! results carrying the old binding are denied, never resurfaced.

pub mod binding;
pub mod registry;

use crate::storage::PluginStateRepo;
use crate::AppState;

pub use binding::{HostAccessError, InstanceBinding, PluginHostState};

/// Plugins enabled on first run when the user has not yet made a choice.
/// Everything else defaults to disabled; the build profile still decides
/// physical inclusion. ponytail: hardcoded policy set, move into manifests only
/// if we ever need per-plugin opt-in defaults beyond the reading loop.
const DEFAULT_ENABLED: &[&str] = &["candidate-inbox", "discovery-feeds"];

#[derive(Debug, thiserror::Error)]
pub enum PluginHostError {
    #[error("unknown-plugin: {0}")]
    UnknownPlugin(String),
    #[error("{0}")]
    Access(#[from] HostAccessError),
    #[error("registry: {0}")]
    Registry(#[from] registry::RegistryError),
    #[error(transparent)]
    Storage(#[from] anyhow::Error),
}

impl PartialEq for PluginHostError {
    fn eq(&self, other: &Self) -> bool {
        use PluginHostError::*;
        match (self, other) {
            (UnknownPlugin(a), UnknownPlugin(b)) => a == b,
            (Access(a), Access(b)) => a == b,
            _ => false,
        }
    }
}

impl PluginHostError {
    /// Redacted error code for IPC surfaces — no plugin internals.
    pub fn code(&self) -> String {
        match self {
            Self::UnknownPlugin(_) => "unknown-plugin".into(),
            Self::Access(e) => e.code().to_string(),
            Self::Registry(e) => format!("registry-{}", e.code),
            Self::Storage(_) => "plugin-storage".into(),
        }
    }
}

/// Enable a plugin: bump its persisted generation, then issue a fresh binding.
/// Order matters — the generation is durable before any binding exists.
pub async fn enable_plugin(
    state: &AppState,
    plugin_id: &str,
) -> Result<InstanceBinding, PluginHostError> {
    let manifest = registry::load_registry()?
        .into_iter()
        .find(|m| m.id == plugin_id)
        .ok_or_else(|| PluginHostError::UnknownPlugin(plugin_id.to_string()))?;
    let operations = registry::granted_operations(&manifest);
    let repo = PluginStateRepo::new(&state.pool);
    let generation = repo.enable(plugin_id).await? as u64;
    Ok(state
        .plugin_host
        .issue(plugin_id, generation, operations)
        .await)
}

/// Disable a plugin: revoke live authority FIRST, then persist. Late results
/// holding the old binding fail authorization and can never resurface.
pub async fn disable_plugin(state: &AppState, plugin_id: &str) -> Result<(), PluginHostError> {
    if !registry::manifest_ids()?.iter().any(|id| id == plugin_id) {
        return Err(PluginHostError::UnknownPlugin(plugin_id.to_string()));
    }
    state.plugin_host.revoke(plugin_id).await;
    PluginStateRepo::new(&state.pool).disable(plugin_id).await?;
    Ok(())
}

/// All known plugins with their persisted host state.
pub async fn list_plugins(
    state: &AppState,
) -> Result<Vec<(crate::mono_contracts::manifest::PluginManifestV1, bool, u64)>, PluginHostError> {
    let manifests = registry::load_registry()?;
    let rows = PluginStateRepo::new(&state.pool).list().await?;
    Ok(manifests
        .into_iter()
        .map(|m| {
            let id = m.id.clone();
            let row = rows.iter().find(|r| r.plugin_id == id);
            let enabled = row
                .map(|r| r.enabled)
                .unwrap_or_else(|| DEFAULT_ENABLED.contains(&id.as_str()));
            let generation = row.map(|r| r.generation as u64).unwrap_or(0);
            (m, enabled, generation)
        })
        .collect())
}

/// Authorize one privileged operation on behalf of a plugin binding. The
/// single funnel every plugin capability call must pass through.
#[allow(dead_code)]
pub async fn authorize(
    state: &AppState,
    binding: &InstanceBinding,
    operation: &str,
) -> Result<(), PluginHostError> {
    Ok(state.plugin_host.authorize(binding, operation).await?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
    use std::collections::BTreeSet;
    use std::str::FromStr;

    async fn test_state() -> AppState {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(
                SqliteConnectOptions::from_str("sqlite::memory:")
                    .unwrap()
                    .foreign_keys(true),
            )
            .await
            .unwrap();
        crate::storage::run_migrations(&pool).await.unwrap();
        AppState {
            ai_cancels: tokio::sync::Mutex::new(std::collections::HashMap::new()),
            pool,
            paths: crate::storage::LibraryPaths::new(std::env::temp_dir()),
            http: reqwest::Client::new(),
            http_external: reqwest::Client::new(),
            host_network: crate::network_egress::HostNetworkState::new(Default::default()),
            batch_cancel: tokio::sync::Mutex::new(None),
            sync_lock: tokio::sync::Mutex::new(()),
            plugin_host: PluginHostState::new(),
        }
    }

    fn ops(items: &[&str]) -> BTreeSet<String> {
        items.iter().map(|s| s.to_string()).collect()
    }

    #[tokio::test]
    async fn enable_issues_live_binding_with_manifest_grants() {
        let state = test_state().await;
        let binding = enable_plugin(&state, "fixture-local").await.unwrap();
        assert_eq!(binding.generation, 1);
        assert!(authorize(&state, &binding, "papers.search").await.is_ok());
        assert_eq!(
            authorize(&state, &binding, "annotations.write").await.err(),
            Some(PluginHostError::Access(HostAccessError::CapabilityDenied))
        );
    }

    #[tokio::test]
    async fn unknown_plugin_is_rejected_before_persistence() {
        let state = test_state().await;
        assert_eq!(
            enable_plugin(&state, "no-such-plugin")
                .await
                .err()
                .map(|e| e.code()),
            Some("unknown-plugin".into())
        );
    }

    #[tokio::test]
    async fn disable_revokes_authority_then_persists() {
        let state = test_state().await;
        let binding = enable_plugin(&state, "fixture-local").await.unwrap();
        assert!(binding.generation >= 1);

        // Authority dies before persistence: after disable_plugin returns, an
        // in-flight late result with the old binding is denied...
        disable_plugin(&state, "fixture-local").await.unwrap();
        assert!(matches!(
            authorize(&state, &binding, "papers.search").await,
            Err(PluginHostError::Access(HostAccessError::StaleGeneration))
        ));

        // ...and the persisted state is disabled.
        let plugins = list_plugins(&state).await.unwrap();
        let (_, enabled, generation) = plugins
            .iter()
            .find(|(m, _, _)| m.id == "fixture-local")
            .unwrap();
        assert!(!enabled);
        assert!(*generation >= 1, "generation survives disable");
    }

    #[tokio::test]
    async fn fresh_install_enables_only_hot_topic_plugins() {
        let state = test_state().await;
        let plugins = list_plugins(&state).await.unwrap();
        let shown: Vec<(String, bool)> = plugins
            .into_iter()
            .filter(|(m, _, _)| !m.id.starts_with("fixture-"))
            .map(|(m, enabled, _)| (m.id, enabled))
            .collect();
        assert_eq!(shown.iter().filter(|(_, e)| *e).count(), 2);
        assert!(shown.iter().any(|(id, e)| id == "discovery-feeds" && *e));
        assert!(shown.iter().any(|(id, e)| id == "candidate-inbox" && *e));
        assert!(shown
            .iter()
            .all(|(id, e)| id == "discovery-feeds" || id == "candidate-inbox" || !*e));
    }

    #[tokio::test]
    async fn reenable_bumps_generation_and_old_binding_stays_stale() {
        let state = test_state().await;
        let first = enable_plugin(&state, "fixture-local").await.unwrap();
        disable_plugin(&state, "fixture-local").await.unwrap();
        let second = enable_plugin(&state, "fixture-local").await.unwrap();
        assert_eq!(second.generation, first.generation + 1);
        assert!(matches!(
            authorize(&state, &first, "papers.search").await,
            Err(PluginHostError::Access(HostAccessError::StaleGeneration))
        ));
        assert!(authorize(&state, &second, "papers.search").await.is_ok());
    }
}
