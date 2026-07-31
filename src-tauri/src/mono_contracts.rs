//! Stable, network-free target-mono-v1 value contracts.
//!
//! These values deliberately do not issue grants, activate plugins, or access
//! persistence. The host task owns those runtime concerns.

pub mod job;
pub mod manifest;

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const CONTRACT_VERSION: &str = "target-mono-v1";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PluginManifestV1 {
    pub api_version: u8,
    pub id: String,
    pub version: String,
    pub core_api: String,
    pub display_name: String,
    pub activation: Value,
    pub dependencies: Vec<Value>,
    pub requested_capabilities: Vec<Value>,
    pub contributions: Vec<Value>,
    pub storage: Value,
    pub migrations: Vec<Value>,
    pub build: Value,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case", deny_unknown_fields)]
pub enum DomainNameV1 {
    Paper,
    Annotation,
    DocumentRevision,
    SourceSegment,
    Note,
    Job,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DomainRefV1 {
    pub contract_version: String,
    pub domain: DomainNameV1,
    pub id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RevisionV1 {
    pub kind: RevisionKindV1,
    pub value: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RevisionKindV1 {
    Number,
    Sha256,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResourceRefV1 {
    pub contract_version: String,
    pub resource: DomainRefV1,
    pub revision: Option<RevisionV1>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum JobOwnerV1 {
    Core {
        component: String,
    },
    Plugin {
        plugin_id: String,
        plugin_version: String,
        generation: u64,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum JobStateV1 {
    Queued,
    Running,
    Cancelling,
    Terminal,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum JobTerminalV1 {
    Succeeded,
    Failed,
    Cancelled,
    Interrupted,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContractError {
    pub code: &'static str,
    pub path: String,
}

fn error(code: &'static str, path: impl Into<String>) -> ContractError {
    ContractError {
        code,
        path: path.into(),
    }
}

fn object<'a>(
    value: &'a Value,
    path: &str,
    code: &'static str,
) -> Result<&'a serde_json::Map<String, Value>, ContractError> {
    value.as_object().ok_or_else(|| error(code, path))
}

fn only(
    object: &serde_json::Map<String, Value>,
    fields: &[&str],
    path: &str,
    code: &'static str,
) -> Result<(), ContractError> {
    for key in object.keys() {
        if !fields.contains(&key.as_str()) {
            return Err(error(code, format!("{path}.{key}")));
        }
    }
    Ok(())
}

pub fn parse_resource_ref(value: &Value) -> Result<ResourceRefV1, ContractError> {
    let root = object(value, "", "resource_ref_invalid")?;
    only(
        root,
        &["contractVersion", "resource", "revision"],
        "",
        "resource_ref_invalid",
    )?;
    let resource = root
        .get("resource")
        .ok_or_else(|| error("resource_ref_invalid", "resource"))?;
    let domain = object(resource, "resource", "resource_ref_invalid")?;
    only(
        domain,
        &["contractVersion", "domain", "id"],
        "resource",
        "resource_ref_invalid",
    )?;
    let id = domain
        .get("id")
        .and_then(Value::as_str)
        .ok_or_else(|| error("domain_ref_invalid", "id"))?;
    if id.is_empty() || !id.is_ascii() {
        return Err(error("domain_ref_invalid", "id"));
    }
    let parsed: ResourceRefV1 = serde_json::from_value(value.clone())
        .map_err(|_| error("resource_ref_invalid", "resource"))?;
    if parsed.contract_version != CONTRACT_VERSION
        || parsed.resource.contract_version != CONTRACT_VERSION
    {
        return Err(error("resource_ref_invalid", "contractVersion"));
    }
    if let Some(revision) = &parsed.revision {
        let valid = match revision.kind {
            RevisionKindV1::Number => {
                !revision.value.is_empty()
                    && revision.value.bytes().all(|byte| byte.is_ascii_digit())
            }
            RevisionKindV1::Sha256 => {
                revision.value.len() == 64
                    && revision
                        .value
                        .bytes()
                        .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
            }
        };
        if !valid {
            return Err(error("resource_ref_invalid", "revision.value"));
        }
    }
    Ok(parsed)
}

/// A manifest declaration is data only. It is never a host grant.
pub fn validate_manifest_declaration(value: &Value) -> Result<(), ContractError> {
    let manifest = object(value, "", "plugin_manifest_invalid")?;
    const FIELDS: &[&str] = &[
        "apiVersion",
        "id",
        "version",
        "coreApi",
        "displayName",
        "activation",
        "dependencies",
        "requestedCapabilities",
        "contributions",
        "storage",
        "migrations",
        "build",
    ];
    only(manifest, FIELDS, "", "plugin_manifest_invalid")?;
    let id = manifest
        .get("id")
        .and_then(Value::as_str)
        .ok_or_else(|| error("plugin_manifest_invalid", "id"))?;
    let valid_id = !id.is_empty()
        && id.bytes().enumerate().all(|(index, byte)| match byte {
            b'a'..=b'z' | b'0'..=b'9' => true,
            b'-' => index > 0 && index + 1 < id.len(),
            _ => false,
        });
    if !valid_id {
        return Err(error("plugin_manifest_invalid", "id"));
    }
    for required in [
        "apiVersion",
        "version",
        "coreApi",
        "displayName",
        "activation",
        "dependencies",
        "requestedCapabilities",
        "contributions",
        "storage",
        "migrations",
        "build",
    ] {
        if !manifest.contains_key(required) {
            return Err(error("plugin_manifest_invalid", required));
        }
    }
    let activation = object(
        &manifest["activation"],
        "activation",
        "plugin_manifest_invalid",
    )?;
    only(
        activation,
        &["frontend", "backend"],
        "activation",
        "plugin_manifest_invalid",
    )?;
    let build = object(&manifest["build"], "build", "plugin_manifest_invalid")?;
    only(
        build,
        &["frontendEntry", "rustFeature"],
        "build",
        "plugin_manifest_invalid",
    )?;
    if activation.contains_key("frontend") != build.contains_key("frontendEntry") {
        return Err(error("plugin_manifest_invalid", "activation.frontend"));
    }
    if activation.contains_key("backend") != build.contains_key("rustFeature") {
        return Err(error("plugin_manifest_invalid", "activation.backend"));
    }
    let mut operations = std::collections::HashSet::new();
    for (capability_index, request) in manifest["requestedCapabilities"]
        .as_array()
        .ok_or_else(|| error("plugin_manifest_invalid", "requestedCapabilities"))?
        .iter()
        .enumerate()
    {
        let request = object(request, "requestedCapabilities", "plugin_manifest_invalid")?;
        let capability = request
            .get("capability")
            .and_then(Value::as_str)
            .ok_or_else(|| error("plugin_manifest_invalid", "requestedCapabilities"))?;
        for operation in request
            .get("operations")
            .and_then(Value::as_array)
            .ok_or_else(|| error("plugin_manifest_invalid", "requestedCapabilities"))?
        {
            let operation = operation
                .as_str()
                .ok_or_else(|| error("plugin_manifest_invalid", "requestedCapabilities"))?;
            if !operation.starts_with(&format!("{capability}.")) || !operations.insert(operation) {
                return Err(error(
                    "plugin_manifest_invalid",
                    format!("requestedCapabilities[{capability_index}].operations"),
                ));
            }
        }
    }
    Ok(())
}

/// The core boundary denies all declaration/caller-derived authority.
pub fn declaration_is_not_authority(
    _manifest: &Value,
    _caller_plugin_id: &str,
) -> Result<(), ContractError> {
    Err(error("permission_denied", "binding"))
}

pub fn validate_job_stream(record: &Value, events: &[Value]) -> Result<(), ContractError> {
    let record_object = object(record, "record", "job_record_invalid")?;
    let owner = object(
        record_object
            .get("owner")
            .ok_or_else(|| error("job_record_invalid", "record.owner"))?,
        "record.owner",
        "job_record_invalid",
    )?;
    let owner_kind = owner
        .get("kind")
        .and_then(Value::as_str)
        .ok_or_else(|| error("job_record_invalid", "record.owner.kind"))?;
    if owner_kind == "plugin"
        && owner
            .get("generation")
            .and_then(Value::as_u64)
            .filter(|n| *n > 0)
            .is_none()
    {
        return Err(error(
            "job_owner_generation_required",
            "record.owner.generation",
        ));
    }
    if owner_kind == "core" && owner.contains_key("generation") {
        return Err(error("job_record_invalid", "record.owner.generation"));
    }
    let id = record_object
        .get("id")
        .and_then(Value::as_str)
        .ok_or_else(|| error("job_record_invalid", "record.id"))?;
    let mut prior_seq = 0;
    let mut terminal = false;
    let mut cancellation_seen = false;
    for (index, event) in events.iter().enumerate() {
        let path = format!("events[{index}]");
        let event_object = object(event, &path, "job_event_invalid")?;
        only(
            event_object,
            &[
                "contractVersion",
                "jobId",
                "seq",
                "at",
                "kind",
                "state",
                "data",
            ],
            &path,
            "job_event_invalid",
        )?;
        let seq = event_object
            .get("seq")
            .and_then(Value::as_u64)
            .filter(|n| *n > prior_seq)
            .ok_or_else(|| error("job_event_sequence_invalid", format!("{path}.seq")))?;
        prior_seq = seq;
        if event_object.get("jobId").and_then(Value::as_str) != Some(id) {
            return Err(error("job_event_job_mismatch", format!("{path}.jobId")));
        }
        if terminal {
            return Err(error(
                if event_object.get("kind").and_then(Value::as_str) == Some("terminal") {
                    "job_terminal_duplicate"
                } else {
                    "job_event_after_terminal"
                },
                path,
            ));
        }
        let kind = event_object
            .get("kind")
            .and_then(Value::as_str)
            .ok_or_else(|| error("job_event_invalid", format!("{path}.kind")))?;
        if kind == "cancellation_requested" {
            cancellation_seen = true;
        }
        if kind == "terminal" {
            terminal = true;
        }
    }
    let state = record_object
        .get("state")
        .and_then(Value::as_str)
        .ok_or_else(|| error("job_state_invalid", "record.state"))?;
    let cancellation = object(
        record_object
            .get("cancellation")
            .ok_or_else(|| error("job_record_invalid", "record.cancellation"))?,
        "record.cancellation",
        "job_record_invalid",
    )?;
    if cancellation.get("requested") == Some(&Value::Bool(true)) && !cancellation_seen {
        return Err(error("job_cancellation_invalid", "record.cancellation"));
    }
    if state == "terminal" && !terminal {
        return Err(error("job_terminal_invalid", "events"));
    }
    if state != "terminal" && terminal {
        return Err(error("job_state_invalid", "record.state"));
    }
    Ok(())
}
