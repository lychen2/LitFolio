//! Canonical target-mono-v1 plugin declaration types and validation.
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::{
    collections::{BTreeMap, BTreeSet, HashMap, HashSet},
    sync::OnceLock,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ManifestError {
    pub code: &'static str,
    pub path: String,
}
fn err(code: &'static str, path: impl Into<String>) -> ManifestError {
    ManifestError {
        code,
        path: path.into(),
    }
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PluginManifestV1 {
    pub api_version: u8,
    pub id: String,
    pub version: String,
    pub core_api: String,
    pub display_name: String,
    pub activation: ActivationV1,
    pub dependencies: Vec<DependencyV1>,
    pub requested_capabilities: Vec<CapabilityRequestV1>,
    pub contributions: Vec<ContributionV1>,
    pub storage: StorageV1,
    pub migrations: Vec<MigrationV1>,
    pub build: BuildV1,
}
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ActivationV1 {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub frontend: Option<FrontendV1>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub backend: Option<BackendV1>,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FrontendV1 {
    pub export: String,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BackendV1 {
    pub command_slice: String,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DependencyV1 {
    pub id: String,
    pub version: String,
    pub optional: bool,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CapabilityRequestV1 {
    pub capability: String,
    pub operations: Vec<String>,
    pub required: bool,
    pub scope: ScopeV1,
    pub limits: LimitsV1,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScopeV1 {
    pub resource_domains: Vec<String>,
    pub contribution_slots: Vec<String>,
    pub job_kinds: Vec<String>,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LimitsV1 {
    pub max_units_per_request: u64,
    pub max_units_per_window: u64,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ContributionV1 {
    pub id: String,
    pub slot: String,
    pub frontend_export: String,
    pub required_operations: Vec<String>,
    pub order: i64,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StorageV1 {
    pub kind: String,
    pub schema_version: u64,
    pub retention: String,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MigrationV1 {
    pub id: String,
    pub from_version: u64,
    pub to_version: u64,
    pub backend_export: String,
    pub sha256: String,
}
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BuildV1 {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub frontend_entry: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rust_feature: Option<String>,
}
const CAPS: &[&str] = &[
    "papers",
    "annotations",
    "reader",
    "ai",
    "storage",
    "files",
    "network",
    "secrets",
    "jobs",
    "events",
    "ui",
    "i18n",
    "logger",
];
const DOMAINS: &[&str] = &[
    "paper",
    "annotation",
    "document-revision",
    "source-segment",
    "note",
    "job",
];
const SLOTS: &[&str] = &[
    "app.routes",
    "app.navigation",
    "app.commandPalette",
    "settings.sections",
    "library.toolbarActions",
    "library.rowActions",
    "library.detailSections",
    "library.filters",
    "import.sources",
    "reader.toolbarActions",
    "reader.selectionActions",
    "reader.sidePanels",
    "reader.annotationDecorators",
    "export.formats",
    "paper.detailActions",
    "jobs.renderers",
];
fn re(cell: &'static OnceLock<Regex>, pat: &str, value: &str) -> bool {
    cell.get_or_init(|| Regex::new(pat).unwrap())
        .is_match(value)
}
fn pid(v: &str) -> bool {
    static R: OnceLock<Regex> = OnceLock::new();
    re(&R, r"^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$", v)
}
fn aid(v: &str) -> bool {
    static R: OnceLock<Regex> = OnceLock::new();
    re(&R, r"^[A-Za-z0-9][A-Za-z0-9._-]*$", v)
}
fn semver(v: &str) -> bool {
    static R: OnceLock<Regex> = OnceLock::new();
    re(
        &R,
        r"^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$",
        v,
    )
}
fn range(v: &str) -> bool {
    semver(v.strip_prefix(['^', '~']).unwrap_or(v))
}
fn op(v: &str) -> bool {
    static R: OnceLock<Regex> = OnceLock::new();
    re(
        &R,
        r"^(papers|annotations|reader|ai|storage|files|network|secrets|jobs|events|ui|i18n|logger)\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*)*$",
        v,
    )
}
fn child(p: &str, k: &str) -> String {
    if p.is_empty() {
        k.into()
    } else {
        format!("{p}.{k}")
    }
}
fn fields<'a>(
    v: &'a Value,
    names: &[&str],
    p: &str,
    optional: bool,
) -> Result<&'a Map<String, Value>, ManifestError> {
    let o = v
        .as_object()
        .ok_or_else(|| err("manifest_field_required", p))?;
    if !optional {
        if let Some(k) = names.iter().filter(|k| !o.contains_key(**k)).min() {
            return Err(err("manifest_field_required", child(p, k)));
        }
    }
    if let Some(k) = o.keys().filter(|k| !names.contains(&k.as_str())).min() {
        return Err(err("manifest_unknown_field", child(p, k)));
    }
    Ok(o)
}
fn text<'a>(v: Option<&'a Value>, p: &str) -> Result<&'a str, ManifestError> {
    v.and_then(Value::as_str)
        .filter(|s| !s.trim().is_empty())
        .ok_or_else(|| err("manifest_field_required", p))
}
fn int(v: Option<&Value>) -> Option<i64> {
    v?.as_i64()
}
fn satisfies(version: &str, requirement: &str) -> bool {
    let base = requirement.trim_start_matches(['^', '~']);
    if !semver(version) || !semver(base) {
        return false;
    }
    let nums = |s: &str| {
        s.split(['.', '-', '+'])
            .take(3)
            .map(|x| x.parse::<u64>().unwrap())
            .collect::<Vec<_>>()
    };
    let a = nums(version);
    let b = nums(base);
    match requirement.as_bytes().first() {
        Some(b'^') => {
            a >= b
                && (if b[0] > 0 {
                    a[0] == b[0]
                } else if b[1] > 0 {
                    a[..2] == b[..2]
                } else {
                    a == b
                })
        }
        Some(b'~') => a >= b && a[..2] == b[..2],
        _ => version == base,
    }
}

pub fn validate_manifest(
    v: &Value,
    available: &HashMap<String, Value>,
) -> Result<PluginManifestV1, ManifestError> {
    let root = fields(
        v,
        &[
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
        ],
        "",
        false,
    )?;
    if int(root.get("apiVersion")) != Some(1) {
        return Err(err("manifest_api_version_unsupported", "apiVersion"));
    }
    let id = root["id"]
        .as_str()
        .filter(|x| pid(x))
        .ok_or_else(|| err("manifest_id_invalid", "id"))?;
    if !root["version"].as_str().is_some_and(semver) {
        return Err(err("manifest_semver_invalid", "version"));
    }
    if !root["coreApi"].as_str().is_some_and(range) {
        return Err(err("manifest_core_api_range_invalid", "coreApi"));
    }
    text(root.get("displayName"), "displayName")?;
    let act = fields(
        &root["activation"],
        &["frontend", "backend"],
        "activation",
        true,
    )?;
    let build = fields(
        &root["build"],
        &["frontendEntry", "rustFeature"],
        "build",
        true,
    )?;
    if let Some(x) = act.get("frontend") {
        let x = fields(x, &["export"], "activation.frontend", false)?;
        text(x.get("export"), "activation.frontend.export")?;
    }
    if let Some(x) = act.get("backend") {
        let x = fields(x, &["commandSlice"], "activation.backend", false)?;
        text(x.get("commandSlice"), "activation.backend.commandSlice")?;
    }
    for k in ["frontendEntry", "rustFeature"] {
        if build.contains_key(k) {
            text(build.get(k), &format!("build.{k}"))?;
        }
    }
    if act.contains_key("frontend") && !build.contains_key("frontendEntry") {
        return Err(err(
            "manifest_frontend_build_missing",
            "build.frontendEntry",
        ));
    }
    if act.contains_key("backend") && !build.contains_key("rustFeature") {
        return Err(err("manifest_backend_build_missing", "build.rustFeature"));
    }
    if build.contains_key("frontendEntry") && !act.contains_key("frontend") {
        return Err(err(
            "manifest_frontend_activation_missing",
            "activation.frontend",
        ));
    }
    if build.contains_key("rustFeature") && !act.contains_key("backend") {
        return Err(err(
            "manifest_backend_activation_missing",
            "activation.backend",
        ));
    }
    let deps = root["dependencies"]
        .as_array()
        .ok_or_else(|| err("manifest_field_required", "dependencies"))?;
    let mut seen = HashSet::new();
    for (i, x) in deps.iter().enumerate() {
        let p = format!("dependencies[{i}]");
        let d = fields(x, &["id", "version", "optional"], &p, false)?;
        let di = d["id"]
            .as_str()
            .filter(|x| pid(x))
            .ok_or_else(|| err("manifest_id_invalid", child(&p, "id")))?;
        if di == id || !seen.insert(di) {
            return Err(err("plugin_dependency_cycle", child(&p, "id")));
        }
        let optional = d["optional"]
            .as_bool()
            .ok_or_else(|| err("manifest_field_required", child(&p, "optional")))?;
        let req = d["version"]
            .as_str()
            .filter(|x| range(x))
            .ok_or_else(|| err("manifest_semver_invalid", child(&p, "version")))?;
        match available.get(di) {
            None if optional => (),
            None => return Err(err("plugin_dependency_missing", child(&p, "id"))),
            Some(x) if !satisfies(x["version"].as_str().unwrap_or(""), req) => {
                return Err(err(
                    "plugin_dependency_version_mismatch",
                    child(&p, "version"),
                ))
            }
            _ => (),
        }
    }
    let requests = root["requestedCapabilities"]
        .as_array()
        .ok_or_else(|| err("manifest_field_required", "requestedCapabilities"))?;
    let (mut caps, mut ops) = (HashSet::new(), HashSet::new());
    for (i, x) in requests.iter().enumerate() {
        let p = format!("requestedCapabilities[{i}]");
        let r = fields(
            x,
            &["capability", "operations", "required", "scope", "limits"],
            &p,
            false,
        )?;
        let cap = r["capability"]
            .as_str()
            .filter(|x| CAPS.contains(x) && caps.insert(*x))
            .ok_or_else(|| err("manifest_capability_unsupported", child(&p, "capability")))?;
        let os = r["operations"]
            .as_array()
            .filter(|x| !x.is_empty())
            .ok_or_else(|| err("manifest_operation_invalid", child(&p, "operations")))?;
        if r["required"].as_bool().is_none() {
            return Err(err("manifest_field_required", child(&p, "required")));
        }
        for (j, x) in os.iter().enumerate() {
            if x.as_str()
                .filter(|x| op(x) && x.split('.').next() == Some(cap) && ops.insert(*x))
                .is_none()
            {
                return Err(err(
                    "manifest_operation_invalid",
                    format!("{p}.operations[{j}]"),
                ));
            }
        }
        let sp = child(&p, "scope");
        let s = fields(
            &r["scope"],
            &["resourceDomains", "contributionSlots", "jobKinds"],
            &sp,
            false,
        )?;
        for (k, allowed) in [("resourceDomains", DOMAINS), ("contributionSlots", SLOTS)] {
            let a = s[k]
                .as_array()
                .ok_or_else(|| err("manifest_field_required", child(&sp, k)))?;
            let mut z = HashSet::new();
            for (j, x) in a.iter().enumerate() {
                if x.as_str()
                    .filter(|x| allowed.contains(x) && z.insert(*x))
                    .is_none()
                {
                    return Err(err(
                        "manifest_capability_unsupported",
                        format!("{sp}.{k}[{j}]"),
                    ));
                }
            }
        }
        let a = s["jobKinds"]
            .as_array()
            .ok_or_else(|| err("manifest_field_required", child(&sp, "jobKinds")))?;
        let mut z = HashSet::new();
        for (j, x) in a.iter().enumerate() {
            if x.as_str().filter(|x| aid(x) && z.insert(*x)).is_none() {
                return Err(err(
                    "manifest_capability_unsupported",
                    format!("{sp}.jobKinds[{j}]"),
                ));
            }
        }
        let lp = child(&p, "limits");
        let l = fields(
            &r["limits"],
            &["maxUnitsPerRequest", "maxUnitsPerWindow"],
            &lp,
            false,
        )?;
        for k in ["maxUnitsPerRequest", "maxUnitsPerWindow"] {
            if int(l.get(k)).is_none_or(|x| x < 1) {
                return Err(err("manifest_field_required", child(&lp, k)));
            }
        }
    }
    let cs = root["contributions"]
        .as_array()
        .ok_or_else(|| err("manifest_field_required", "contributions"))?;
    if !cs.is_empty() && !act.contains_key("frontend") {
        return Err(err(
            "manifest_frontend_activation_missing",
            "activation.frontend",
        ));
    }
    if !cs.is_empty() && !build.contains_key("frontendEntry") {
        return Err(err(
            "manifest_frontend_build_missing",
            "build.frontendEntry",
        ));
    }
    let (mut ids, mut exports) = (HashSet::new(), HashSet::new());
    if let Some(x) = act.get("frontend") {
        exports.insert(x["export"].as_str().unwrap());
    }
    for (i, x) in cs.iter().enumerate() {
        let p = format!("contributions[{i}]");
        let c = fields(
            x,
            &[
                "id",
                "slot",
                "frontendExport",
                "requiredOperations",
                "order",
            ],
            &p,
            false,
        )?;
        if c["id"]
            .as_str()
            .filter(|x| aid(x) && ids.insert(*x))
            .is_none()
        {
            return Err(err("manifest_field_required", child(&p, "id")));
        }
        if c["slot"].as_str().filter(|x| SLOTS.contains(x)).is_none() {
            return Err(err(
                "manifest_contribution_slot_unsupported",
                child(&p, "slot"),
            ));
        }
        let ex = text(c.get("frontendExport"), &child(&p, "frontendExport"))?;
        if !exports.insert(ex) {
            return Err(err(
                "manifest_export_duplicate",
                child(&p, "frontendExport"),
            ));
        }
        if int(c.get("order")).is_none() {
            return Err(err("manifest_field_required", child(&p, "order")));
        }
        let required = c["requiredOperations"]
            .as_array()
            .ok_or_else(|| err("manifest_field_required", child(&p, "requiredOperations")))?;
        let mut z = HashSet::new();
        for (j, x) in required.iter().enumerate() {
            let Some(x) = x.as_str().filter(|x| z.insert(*x)) else {
                return Err(err(
                    "manifest_operation_invalid",
                    format!("{p}.requiredOperations[{j}]"),
                ));
            };
            if !ops.contains(x) {
                return Err(err(
                    "manifest_contribution_operation_undeclared",
                    format!("{p}.requiredOperations[{j}]"),
                ));
            }
        }
    }
    let storage = fields(
        &root["storage"],
        &["kind", "schemaVersion", "retention"],
        "storage",
        false,
    )?;
    let ms = root["migrations"]
        .as_array()
        .ok_or_else(|| err("manifest_field_required", "migrations"))?;
    if !ms.is_empty() && !act.contains_key("backend") {
        return Err(err(
            "manifest_backend_activation_missing",
            "activation.backend",
        ));
    }
    if !ms.is_empty() && !build.contains_key("rustFeature") {
        return Err(err("manifest_backend_build_missing", "build.rustFeature"));
    }
    if storage["retention"] != "preserve-on-disable" {
        return Err(err("manifest_storage_invalid", "storage.retention"));
    }
    match storage["kind"].as_str() {
        Some("none") => {
            if int(storage.get("schemaVersion")) != Some(0) {
                return Err(err("manifest_storage_invalid", "storage.schemaVersion"));
            }
            if !ms.is_empty() {
                return Err(err("manifest_storage_invalid", "storage"));
            }
        }
        Some("sidecar-sqlite") => {
            let schema = int(storage.get("schemaVersion"))
                .filter(|x| *x > 0)
                .ok_or_else(|| err("manifest_storage_invalid", "storage.schemaVersion"))?;
            let (mut from, mut ids, mut exports) = (0, HashSet::new(), HashSet::new());
            for (i, x) in ms.iter().enumerate() {
                let p = format!("migrations[{i}]");
                let m = fields(
                    x,
                    &["id", "fromVersion", "toVersion", "backendExport", "sha256"],
                    &p,
                    false,
                )?;
                if int(m.get("fromVersion")) != Some(from) {
                    return Err(err(
                        "manifest_migration_chain_invalid",
                        child(&p, "fromVersion"),
                    ));
                }
                if int(m.get("toVersion")) != Some(from + 1) {
                    return Err(err(
                        "manifest_migration_chain_invalid",
                        child(&p, "toVersion"),
                    ));
                }
                let mi = m["id"]
                    .as_str()
                    .filter(|x| aid(x))
                    .ok_or_else(|| err("manifest_migration_chain_invalid", child(&p, "id")))?;
                if !ids.insert(mi)
                    || !m["sha256"].as_str().is_some_and(|x| {
                        x.len() == 64
                            && x.bytes()
                                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
                    })
                {
                    return Err(err("manifest_migration_chain_invalid", p));
                }
                let ex =
                    text(m.get("backendExport"), &child(&p, "backendExport")).map_err(|_| {
                        err(
                            "manifest_migration_chain_invalid",
                            child(&p, "backendExport"),
                        )
                    })?;
                if !exports.insert(ex) {
                    return Err(err("manifest_export_duplicate", child(&p, "backendExport")));
                }
                from += 1
            }
            if from != schema {
                return Err(err("manifest_migration_chain_invalid", "migrations"));
            }
        }
        _ => return Err(err("manifest_storage_invalid", "storage.kind")),
    }
    serde_json::from_value(v.clone()).map_err(|_| err("manifest_field_required", ""))
}

pub fn validate_manifest_set(
    values: &[Value],
    target: &str,
) -> Result<Vec<PluginManifestV1>, ManifestError> {
    if !semver(target) {
        return Err(err(
            "manifest_core_api_range_invalid",
            "targetCoreApiVersion",
        ));
    }
    let mut available = HashMap::new();
    for v in values {
        let id = v.get("id").and_then(Value::as_str).unwrap_or("").to_owned();
        if available.insert(id.clone(), v.clone()).is_some() {
            return Err(err("manifest_id_invalid", format!("manifests.{id}.id")));
        }
    }
    let mut all = BTreeMap::new();
    for v in values {
        let m = validate_manifest(v, &available)?;
        if !satisfies(target, &m.core_api) {
            return Err(err(
                "plugin_incompatible",
                format!("manifests.{}.coreApi", m.id),
            ));
        }
        all.insert(m.id.clone(), m);
    }
    let mut order = Vec::new();
    let mut done = BTreeSet::new();
    while order.len() < all.len() {
        let next = all
            .iter()
            .find(|(id, m)| {
                !done.contains(*id)
                    && m.dependencies
                        .iter()
                        .filter(|d| !d.optional && all.contains_key(&d.id))
                        .all(|d| done.contains(&d.id))
            })
            .map(|(id, _)| id.clone());
        let Some(id) = next else {
            let (id, m) = all.iter().find(|(id, _)| !done.contains(*id)).unwrap();
            let (index, _) = m
                .dependencies
                .iter()
                .enumerate()
                .find(|(_, d)| !d.optional && !done.contains(&d.id))
                .unwrap();
            return Err(err(
                "plugin_dependency_cycle",
                format!("manifests.{id}.dependencies[{index}].id"),
            ));
        };
        done.insert(id.clone());
        order.push(id);
    }
    Ok(order
        .into_iter()
        .map(|id| all.remove(&id).unwrap())
        .collect())
}
