import { CONTRACT_VERSION, ContractError, type DomainNameV1 } from "@/core/contracts";

/** Canonical shape from .trellis/spec/cross-layer/mono-contracts.md. Declarations are not grants. */
export interface PluginManifestV1 {
  apiVersion: 1; id: string; version: string; coreApi: string; displayName: string;
  activation: { frontend?: { export: string }; backend?: { commandSlice: string } };
  dependencies: Array<{ id: string; version: string; optional: boolean }>;
  requestedCapabilities: Array<{ capability: CapabilityNameV1; operations: string[]; required: boolean; scope: { resourceDomains: DomainNameV1[]; contributionSlots: ContributionSlotV1[]; jobKinds: string[] }; limits: { maxUnitsPerRequest: number; maxUnitsPerWindow: number } }>;
  contributions: Array<{ id: string; slot: ContributionSlotV1; frontendExport: string; requiredOperations: string[]; order: number }>;
  storage: { kind: "none" | "sidecar-sqlite"; schemaVersion: number; retention: "preserve-on-disable" };
  migrations: Array<{ id: string; fromVersion: number; toVersion: number; backendExport: string; sha256: string }>;
  build: { frontendEntry?: string; rustFeature?: string };
}
export type CapabilityNameV1 = "papers" | "annotations" | "reader" | "ai" | "storage" | "files" | "network" | "secrets" | "jobs" | "events" | "ui" | "i18n" | "logger";
export type ContributionSlotV1 = "app.routes" | "app.navigation" | "app.commandPalette" | "settings.sections" | "library.toolbarActions" | "library.rowActions" | "library.detailSections" | "library.filters" | "import.sources" | "reader.toolbarActions" | "reader.selectionActions" | "reader.sidePanels" | "reader.annotationDecorators" | "export.formats" | "paper.detailActions" | "jobs.renderers";
const capabilities = new Set<CapabilityNameV1>(["papers", "annotations", "reader", "ai", "storage", "files", "network", "secrets", "jobs", "events", "ui", "i18n", "logger"]);
const slots = new Set<ContributionSlotV1>(["app.routes", "app.navigation", "app.commandPalette", "settings.sections", "library.toolbarActions", "library.rowActions", "library.detailSections", "library.filters", "import.sources", "reader.toolbarActions", "reader.selectionActions", "reader.sidePanels", "reader.annotationDecorators", "export.formats", "paper.detailActions", "jobs.renderers"]);
const domains = new Set<DomainNameV1>(["paper", "annotation", "document-revision", "source-segment", "note", "job"]);
const pluginId = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const semver = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-(?:0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const operation = /^([a-z][a-z0-9]*(?:-[a-z0-9]+)*)\.([a-z][a-z0-9]*(?:-[a-z0-9]+)*)(?:\.([a-z][a-z0-9]*(?:-[a-z0-9]+)*))*$/;
const sha256 = /^[0-9a-f]{64}$/;
const isInteger = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value);
const fail = (code: string, path: string): never => { throw new ContractError(code, path); };
function object(value: unknown, path: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) fail("manifest_field_required", path); return value as Record<string, unknown>; }
function fields(value: unknown, names: readonly string[], path: string): Record<string, unknown> { const obj = object(value, path); for (const key of Object.keys(obj)) if (!names.includes(key)) fail("manifest_unknown_field", `${path}.${key}`); for (const name of names) if (!(name in obj)) fail("manifest_field_required", `${path}.${name}`); return obj; }
function optionalFields(value: unknown, names: readonly string[], path: string): Record<string, unknown> { const obj = object(value, path); for (const key of Object.keys(obj)) if (!names.includes(key)) fail("manifest_unknown_field", `${path}.${key}`); return obj; }
function text(value: unknown, path: string): string { return typeof value === "string" && value.length > 0 ? value : fail("manifest_field_required", path); }

export function parsePluginManifestV1(value: unknown): PluginManifestV1 {
  const m = fields(value, ["apiVersion", "id", "version", "coreApi", "displayName", "activation", "dependencies", "requestedCapabilities", "contributions", "storage", "migrations", "build"], "");
  if (m.apiVersion !== 1) fail("manifest_api_version_unsupported", "apiVersion");
  if (typeof m.id !== "string" || !pluginId.test(m.id)) fail("manifest_id_invalid", "id");
  if (typeof m.version !== "string" || !semver.test(m.version)) fail("manifest_semver_invalid", "version");
  if (typeof m.coreApi !== "string" || !/^[~^]?(?:0|[1-9][0-9]*)\./.test(m.coreApi) || !semver.test(m.coreApi.replace(/^[~^]/, ""))) fail("manifest_core_api_range_invalid", "coreApi");
  text(m.displayName, "displayName");
  const activation = optionalFields(m.activation, ["frontend", "backend"], "activation"); const build = optionalFields(m.build, ["frontendEntry", "rustFeature"], "build");
  if (activation.frontend !== undefined) { const v = fields(activation.frontend, ["export"], "activation.frontend"); text(v.export, "activation.frontend.export"); if (!build.frontendEntry) fail("manifest_frontend_build_missing", "build.frontendEntry"); }
  if (activation.backend !== undefined) { const v = fields(activation.backend, ["commandSlice"], "activation.backend"); text(v.commandSlice, "activation.backend.commandSlice"); if (!build.rustFeature) fail("manifest_backend_build_missing", "build.rustFeature"); }
  if (build.frontendEntry !== undefined && (typeof build.frontendEntry !== "string" || !build.frontendEntry)) fail("manifest_field_required", "build.frontendEntry"); if (build.rustFeature !== undefined && (typeof build.rustFeature !== "string" || !build.rustFeature)) fail("manifest_field_required", "build.rustFeature");
  if (build.frontendEntry && !activation.frontend) fail("manifest_frontend_activation_missing", "activation.frontend"); if (build.rustFeature && !activation.backend) fail("manifest_backend_activation_missing", "activation.backend");
  if (!Array.isArray(m.dependencies)) fail("manifest_field_required", "dependencies");
  for (const [i, raw] of (m.dependencies as unknown[]).entries()) { const d = fields(raw, ["id", "version", "optional"], `dependencies[${i}]`); if (typeof d.id !== "string" || !pluginId.test(d.id) || d.id === m.id) fail("manifest_id_invalid", `dependencies[${i}].id`); if (typeof d.version !== "string" || !semver.test(d.version.replace(/^[~^]/, ""))) fail("manifest_semver_invalid", `dependencies[${i}].version`); if (typeof d.optional !== "boolean") fail("manifest_field_required", `dependencies[${i}].optional`); }
  if (!Array.isArray(m.requestedCapabilities)) fail("manifest_field_required", "requestedCapabilities"); const requested = new Set<string>(); const requestedCapabilities = new Set<string>();
  for (const [i, raw] of (m.requestedCapabilities as unknown[]).entries()) { const r = fields(raw, ["capability", "operations", "required", "scope", "limits"], `requestedCapabilities[${i}]`); if (typeof r.capability !== "string" || !capabilities.has(r.capability as CapabilityNameV1) || requestedCapabilities.has(r.capability)) fail("manifest_capability_unsupported", `requestedCapabilities[${i}].capability`); requestedCapabilities.add(r.capability as string); if (!Array.isArray(r.operations) || !r.operations.length || new Set(r.operations).size !== r.operations.length || !r.operations.every((v: unknown) => typeof v === "string" && operation.test(v) && v.split(".")[0] === r.capability && !requested.has(v))) fail("manifest_operation_invalid", `requestedCapabilities[${i}].operations`); (r.operations as string[]).forEach((v) => requested.add(v)); if (typeof r.required !== "boolean") fail("manifest_field_required", `requestedCapabilities[${i}].required`);
    const scope = fields(r.scope, ["resourceDomains", "contributionSlots", "jobKinds"], `requestedCapabilities[${i}].scope`); if (!Array.isArray(scope.resourceDomains) || !scope.resourceDomains.every((v) => typeof v === "string" && domains.has(v as DomainNameV1)) || !Array.isArray(scope.contributionSlots) || !scope.contributionSlots.every((v) => typeof v === "string" && slots.has(v as ContributionSlotV1)) || !Array.isArray(scope.jobKinds) || !scope.jobKinds.every((v) => typeof v === "string" && /^[\x21-\x7e]+$/.test(v))) fail("manifest_capability_unsupported", `requestedCapabilities[${i}].scope`);
    const limits = fields(r.limits, ["maxUnitsPerRequest", "maxUnitsPerWindow"], `requestedCapabilities[${i}].limits`); if (!isInteger(limits.maxUnitsPerRequest) || limits.maxUnitsPerRequest <= 0 || !isInteger(limits.maxUnitsPerWindow) || limits.maxUnitsPerWindow <= 0) fail("manifest_field_required", `requestedCapabilities[${i}].limits`); }
  if (!Array.isArray(m.contributions)) fail("manifest_field_required", "contributions"); const contributionIds = new Set<string>(); const frontendExports = new Set<string>(activation.frontend ? [(activation.frontend as Record<string, unknown>).export as string] : []); for (const [i, raw] of (m.contributions as unknown[]).entries()) { const c = fields(raw, ["id", "slot", "frontendExport", "requiredOperations", "order"], `contributions[${i}]`); if (!activation.frontend || !build.frontendEntry) fail("manifest_frontend_activation_missing", `contributions[${i}]`); if (typeof c.id !== "string" || !c.id || contributionIds.has(c.id) || typeof c.slot !== "string" || !slots.has(c.slot as ContributionSlotV1) || typeof c.frontendExport !== "string" || !c.frontendExport || frontendExports.has(c.frontendExport) || !Array.isArray(c.requiredOperations) || new Set(c.requiredOperations).size !== c.requiredOperations.length || !c.requiredOperations.every((op) => typeof op === "string" && requested.has(op)) || !isInteger(c.order)) fail("manifest_field_required", `contributions[${i}]`); contributionIds.add(c.id as string); frontendExports.add(c.frontendExport as string); }
  const storage = fields(m.storage, ["kind", "schemaVersion", "retention"], "storage"); if ((storage.kind !== "none" && storage.kind !== "sidecar-sqlite") || storage.retention !== "preserve-on-disable" || !isInteger(storage.schemaVersion) || storage.schemaVersion < 0) fail("manifest_storage_invalid", "storage"); if (!Array.isArray(m.migrations)) fail("manifest_field_required", "migrations"); const migrations = m.migrations as unknown[]; if (storage.kind === "none" && (storage.schemaVersion !== 0 || migrations.length)) fail("manifest_storage_invalid", "storage"); if (storage.kind === "sidecar-sqlite" && (!storage.schemaVersion || !migrations.length || !activation.backend || !build.rustFeature)) fail("manifest_storage_invalid", "storage");
  let next = 0; const exports = new Set<string>(); for (const [i, raw] of migrations.entries()) { const migration = fields(raw, ["id", "fromVersion", "toVersion", "backendExport", "sha256"], `migrations[${i}]`); if (!isInteger(migration.fromVersion) || migration.fromVersion !== next || !isInteger(migration.toVersion) || migration.toVersion !== next + 1 || typeof migration.id !== "string" || !migration.id || typeof migration.backendExport !== "string" || !migration.backendExport || exports.has(migration.backendExport) || typeof migration.sha256 !== "string" || !sha256.test(migration.sha256)) fail("manifest_migration_chain_invalid", `migrations[${i}]`); exports.add(migration.backendExport as string); next++; } if (storage.kind === "sidecar-sqlite" && next !== storage.schemaVersion) fail("manifest_migration_chain_invalid", "migrations");
  return m as unknown as PluginManifestV1;
}

export function parsePluginManifestSetV1(values: unknown[]): PluginManifestV1[] {
  const manifests = values.map(parsePluginManifestV1);
  const byId = new Map<string, PluginManifestV1>();
  for (const manifest of manifests) {
    if (byId.has(manifest.id)) fail("manifest_id_invalid", "id");
    byId.set(manifest.id, manifest);
  }
  for (const manifest of manifests) for (const dependency of manifest.dependencies) {
    const target = byId.get(dependency.id);
    if (!target && !dependency.optional) fail("plugin_dependency_missing", `dependencies.${dependency.id}`);
    if (target && !matchesRange(target.version, dependency.version)) fail("plugin_dependency_version_mismatch", `dependencies.${dependency.id}.version`);
  }
  const visiting = new Set<string>(); const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) fail("plugin_dependency_cycle", `dependencies.${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id)!.dependencies) if (!dependency.optional && byId.has(dependency.id)) visit(dependency.id);
    visiting.delete(id); visited.add(id);
  };
  for (const manifest of manifests) visit(manifest.id);
  return manifests;
}

function matchesRange(version: string, range: string): boolean {
  if (!range.startsWith("^") && !range.startsWith("~")) return version === range;
  const [major, minor, patch] = version.split(/[-+.]/, 3).map(Number);
  const [rangeMajor, rangeMinor, rangePatch] = range.slice(1).split(/[-+.]/, 3).map(Number);
  if (range.startsWith("~")) return major === rangeMajor && minor === rangeMinor && patch >= rangePatch;
  if (major !== rangeMajor) return false;
  if (major > 0) return minor > rangeMinor || (minor === rangeMinor && patch >= rangePatch);
  return minor === rangeMinor && patch >= rangePatch;
}
export { CONTRACT_VERSION };
