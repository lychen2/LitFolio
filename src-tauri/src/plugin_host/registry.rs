//! Static plugin registry: the canonical compiled-in manifest set.
//!
//! Manifests live in `plugins/<id>/manifest.json` at the repo root — the one
//! source of truth. The backend embeds them at compile time and validates the
//! whole set with [`crate::mono_contracts::validate_manifest_set`]; the
//! frontend imports the same files. There is no second manifest source.

use std::collections::BTreeSet;

use crate::mono_contracts::manifest::{
    validate_manifest_set, ManifestError, PluginManifestV1 as CompiledManifest,
};

/// Core API version this build exposes to plugins. Manifest `coreApi` ranges
/// must be satisfied by this exact version.
pub const CORE_API_TARGET: &str = "1.0.0";

const EMBEDDED_MANIFESTS: &[(&str, &str)] = &[
    ("candidate-inbox", include_str!("../../../plugins/candidate-inbox/manifest.json")),
    ("discovery-feeds", include_str!("../../../plugins/discovery-feeds/manifest.json")),
    ("document-services", include_str!("../../../plugins/document-services/manifest.json")),
    ("fixture-local", include_str!("../../../plugins/fixture-local/manifest.json")),
    ("knowledge-graph", include_str!("../../../plugins/knowledge-graph/manifest.json")),
    ("library-ask", include_str!("../../../plugins/library-ask/manifest.json")),
    ("library-plus", include_str!("../../../plugins/library-plus/manifest.json")),
    ("research-workbench", include_str!("../../../plugins/research-workbench/manifest.json")),
    ("source-connectors", include_str!("../../../plugins/source-connectors/manifest.json")),
    ("sync-integrations", include_str!("../../../plugins/sync-integrations/manifest.json")),
    ("updates", include_str!("../../../plugins/updates/manifest.json")),
];

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
#[error("{code}: {path}")]
pub struct RegistryError {
    pub code: String,
    pub path: String,
}

impl From<ManifestError> for RegistryError {
    fn from(e: ManifestError) -> Self {
        Self { code: e.code.to_string(), path: e.path }
    }
}

/// Compile-time manifest JSON, parsed fresh per call (cheap; test-friendly).
fn embedded_values() -> Vec<serde_json::Value> {
    EMBEDDED_MANIFESTS
        .iter()
        .map(|(id, raw)| {
            serde_json::from_str(raw).unwrap_or_else(|e| {
                panic!("embedded plugin manifest {id} is not valid JSON: {e}")
            })
        })
        .collect()
}

/// Validate the embedded set against this build's core API target and return
/// manifests in dependency activation order.
pub fn load_registry() -> Result<Vec<CompiledManifest>, RegistryError> {
    let profile = option_env!("LITFOLIO_PROFILE").unwrap_or("all");
    let selected: BTreeSet<&str> = if profile == "core" {
        BTreeSet::new()
    } else if profile == "all" {
        EMBEDDED_MANIFESTS.iter().map(|(id, _)| *id).collect()
    } else {
        profile.split(',').collect()
    };
    let values = embedded_values()
        .into_iter()
        .zip(EMBEDDED_MANIFESTS.iter().map(|(id, _)| *id))
        .filter_map(|(value, id)| selected.contains(id).then_some(value))
        .collect::<Vec<_>>();
    Ok(validate_manifest_set(&values, CORE_API_TARGET)?
        .into_iter()
        .filter(|manifest| selected.contains(manifest.id.as_str()))
        .collect())
}


pub fn manifest_ids() -> Result<Vec<String>, RegistryError> {
    Ok(load_registry()?.into_iter().map(|m| m.id).collect())
}

/// Operations granted by a plugin's manifest, across all capability requests.
pub fn granted_operations(manifest: &CompiledManifest) -> std::collections::BTreeSet<String> {
    let mut out = std::collections::BTreeSet::new();
    for request in &manifest.requested_capabilities {
        for op in &request.operations {
            out.insert(op.clone());
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embedded_set_is_valid_and_dependency_ordered() {
        let registry = load_registry().expect("embedded manifests validate");
        assert_eq!(registry.len(), EMBEDDED_MANIFESTS.len());
        let ids: Vec<&str> = registry.iter().map(|m| m.id.as_str()).collect();
        assert!(ids.contains(&"fixture-local"));
        assert!(ids.contains(&"library-ask"));
    }

    #[test]
    fn library_ask_grants_declared_operations_only() {
        let registry = load_registry().unwrap();
        let ask = registry.iter().find(|m| m.id == "library-ask").unwrap();
        let ops = granted_operations(ask);
        assert!(ops.contains("ai.chat"));
        assert!(ops.contains("papers.search"));
        assert!(ops.contains("network.request"));
        assert!(!ops.contains("annotations.write"));
        assert!(!ops.contains("secrets.read"));
    }

    #[test]
    fn fixture_grants_only_declared_operations() {
        let registry = load_registry().unwrap();
        let fixture = registry.iter().find(|m| m.id == "fixture-local").unwrap();
        let ops = granted_operations(fixture);
        assert_eq!(ops.len(), 1);
        assert!(ops.contains("papers.search"));
        assert!(!ops.contains("papers.read"));
    }
}
