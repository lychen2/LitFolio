# Build Plugin Host and SDK - Design

## 1. Scope and Delivery Shape

This child establishes the V1 host platform after core domains are stable. It does not extract a production feature. Delivery is staged so the authority and disable model is proven by a local-only fixture before network, secrets, AI, schedules, files, or user-content mutation capabilities are available.

```text
Stage A: canonical manifest compiler + resolved inclusion plan
  -> Stage B: minimal local host + opaque binding + local fixture
  -> Stage C: generation-safe jobs/execution/disable + artifact exclusion proof
  -> Stage D: privileged typed grants + proposal integration
```

Production extraction cannot start until Stages A through C pass. Each Stage D capability is independently gated and cannot widen the minimal host implicitly.

## 2. Canonical Manifest and Inclusion

The child consumes the parent-owned schema without aliases or a second reduced manifest:

```ts
interface PluginManifestV1 {
  apiVersion: 1;
  id: PluginId;
  version: Semver;
  coreApi: SemverRange;
  displayName: string;
  activation: {
    frontend?: FrontendEntrypoint;
    backend?: BackendEntrypoint;
  };
  dependencies: PluginDependency[];
  requestedCapabilities: PluginCapabilityRequest[];
  contributions: PluginContributionDeclaration[];
  storage: PluginStorageDeclaration;
  migrations: PluginMigrationDeclaration[];
  build: {
    frontendEntry?: string;
    rustFeature?: string;
  };
}

interface LitFolioPlugin {
  manifest: PluginManifestV1;
  activate(ctx: PluginContext):
    | void
    | PluginDisposer
    | Promise<void | PluginDisposer>;
}

type PluginDisposer = () => void | Promise<void>;
```

A build-time compiler validates manifests, resolves versions/dependencies, and emits one versioned `ResolvedPluginInclusionPlan`. Generated frontend entries, Rust feature/command slices, runtime registry inputs, mocks, fixtures, and conversion ownership metadata identify their source manifest and inclusion-plan digest. Unsupported capabilities, duplicate IDs, cycles, missing ranges, backend activation without a Rust build entry, frontend activation without a frontend build entry, and declarations unsupported by the target fail before activation.

Runtime enablement is persisted separately from build inclusion. An excluded plugin has no runtime row that can activate code absent from the artifact. A disabled included plugin retains state and sidecar data but publishes no contributions and holds no live binding.

## 3. Host Authority and Transport

### 3.1 Binding Model

A plugin ID is descriptive. Authority comes only from a host-issued binding:

```text
validated included plugin + enable request
  -> host allocates new monotonic generation
  -> host resolves approved operation grants
  -> host creates opaque instance binding
  -> host-owned frontend adapter holds/attaches binding
  -> Rust reference monitor resolves binding for every operation
  -> typed operation handler rechecks grant and generation
```

The binding is an opaque branded handle in TypeScript and an unguessable token at the IPC boundary. The public SDK cannot inspect, construct, serialize, persist, or substitute it. The host transport accepts typed SDK operations rather than a public generic invoke method. Arbitrary route code has no API for acquiring a binding.

Rust owns a binding registry. Each entry has an immutable principal (plugin ID/version, generation, resolved grants, and cancellation owner) plus host-controlled live/revoked lifecycle state. The reference monitor performs this order for every plugin-attributed operation:

1. Resolve the opaque binding.
2. Confirm the plugin is included, enabled, and in the same live generation.
3. Resolve the exact operation-specific grant.
4. Validate resource scope, limits, consent, and target ownership.
5. Open/update the core-owned execution record required by the operation policy before dispatch; denials are always audited.
6. Dispatch through the typed host service and terminalize the record.

Request payload `pluginId`, contribution ownership, route origin, manifest metadata, or frontend permission state never substitutes for steps 1 through 4. Backend services do not accept an ambient plugin-capable `AppState`; typed handlers receive only the validated principal plus the narrow host service needed for that operation.

### 3.2 Structured Errors

```ts
type PluginErrorCode =
  | "plugin_excluded"
  | "plugin_disabled"
  | "plugin_instance_missing"
  | "plugin_instance_stale"
  | "plugin_incompatible"
  | "plugin_dependency_missing"
  | "permission_denied"
  | "scope_not_approved"
  | "operation_limit_exceeded"
  | "plugin_activation_failed"
  | "plugin_disable_timeout"
  | "proposal_conflict"
  | "proposal_invalid";
```

Errors expose stable code, correlation ID, and redacted safe details. They never expose bindings, paths, SQL, secret references not already visible to the user, secret values, or private document excerpts.

## 4. Operation-Level Typed Grants

Manifest capability requests are requests, not authority. Enablement/consent resolves them into immutable grants attached to one binding generation.

```ts
interface OperationGrantBase {
  operation: PluginOperation;
  resourceScope: ResourceScope;
  limits: OperationLimits;
  consent: "activation" | "per-use" | "approved-schedule";
  redaction: ExecutionRedactionPolicy;
  revocation: "cancel" | "drain-read-only" | "reject-result";
}

interface NetworkFetchGrant extends OperationGrantBase {
  operation: "network.fetch";
  hosts: readonly HostPattern[];
  methods: readonly ("GET" | "POST")[];
  maxRequestBytes: number;
  maxResponseBytes: number;
  credentialRefs: readonly SecretReferenceId[];
}
```

Each operation has a separate request/result schema and validator. A paper read grant does not imply annotation read/write; storage does not imply files; network does not imply secrets; AI does not imply retrieval or user-content mutation. Redirects are revalidated as new targets. A secret reference is resolved and applied only inside the host-owned request adapter, and the plugin never receives its value.

The V1 public SDK has no process spawn, shell, MCP runtime, TCP/local-daemon RPC, dynamic library loading, generic Tauri `invoke`, arbitrary command adapter, raw `AppState`, SQLx/SQLite pool, raw SQL, filesystem root, database/plugin path, keyring handle, or secret-value operation.

## 5. Minimal Local Host

The first executable host exposes only narrow local interfaces:

- `ui`: fixed parent-defined V1 slots, staged registration, stable IDs, deterministic order, and host-owned disposal.
- `storage`: typed sidecar operations and transactional declared migrations without revealing a path or pool.
- `events`: declared host event subscriptions with bounded payloads and automatic owner cleanup.
- `jobs`: host-owned cancellable local jobs with typed kind/input/progress/result and generation checks.
- `execution`, `logger`, and `i18n`: core-owned redacted records plus bounded diagnostics and translations.

The local fixture has no network, secrets, arbitrary files, AI provider, schedule, process, or external service. It registers one declaration in every fixed V1 slot, stores fixture rows, subscribes to a declared event, and runs deterministic cancellable/delayed jobs. It also submits denied privileged/forbidden-operation test requests whose handlers prove no underlying dispatch occurred. Controlled variants cover incompatible manifest, migration failure, duplicate contribution, activation failure after staged registration, delayed completion, non-cooperative cancellation, and disposer failure.

Contributions remain staged until activation succeeds, then publish atomically. Slot render failures are caught at the owner boundary. Host registries own every contribution/subscription/job/timer/disposer and can remove them without relying on a successful plugin disposer.

## 6. Core-Owned Jobs, Execution, and Proposals

### 6.1 Jobs

Plugins submit declared job requests to the host runtime. A job record contains ID, owner plugin/version/generation, typed kind, trigger, state, progress summary, execution correlation ID, cancellation token, timestamps, and redacted error/result summary. Plugins cannot create an untracked scheduler or arbitrary background task through the SDK.

Disable closes admission for the generation, requests cancellation, and bounded-drains active jobs. A job may finish computation after revocation, but commit and publication require a live-generation check. A non-cooperative job is terminalized as interrupted/timed out and its eventual result is ignored.

### 6.2 Execution Records

Core opens an `ExecutionRecord` before privileged or asynchronous dispatch and appends ordered `ExecutionEvent`s. Covered operations include plugin activation/disable failures, jobs, AI calls, network calls, schedules, parser operations, proposal creation/apply, cancellations, degradations, and permission denials. Records include owner, generation, trigger, context references, operation, target/resource summary, running/terminal state, timing, correlation ID, cancellation, and redacted result/error.

Plugins may report bounded progress through the host but cannot suppress, rewrite, delete, or falsely terminalize required records. Secret values and full private excerpts are excluded by default. Historical records survive disable; a disabled plugin cannot start new work.

### 6.3 Proposals

A plugin cannot directly alter user-authored notes, annotations, tags, metadata, accepted documents, or research artifacts. It requests a core-owned proposal containing owner/generation, target, base revision/hash, typed patch/operation, evidence references, digest, idempotency key, and expiry/revocation policy.

Proposal creation and apply are separate recorded operations. Apply rechecks current permission, target ownership, proposal digest, base state, receipt/replay status, and owner lifecycle policy. A stale generation cannot publish a new proposal or direct apply; an already reviewable proposal follows its explicit revocation policy and still requires current host/core authorization. Conflict or interrupted apply leaves user content unchanged or recovers through the core journal.

## 7. Storage and Migration

Plugin sidecars are opened only after manifest, compatibility, dependency, grant, and generation validation. Host storage maps the resolved plugin principal internally to `plugins/<plugin-id>/data.db`; the path is never returned.

Declared migrations are versioned, transactional, and backed up before destructive change. Migration failure rolls back the sidecar, tears down staged resources, invalidates the binding, and leaves core usable. Path traversal, symlink escape, attached databases, arbitrary pragmas/extensions, and access to `library.db` or another sidecar are unavailable through the typed API and covered by backend tests.

Disable closes handles after work is cancelled/drained. Sidecar data and persisted settings remain. Historical migrations `0001` through `0035` are not edited.

## 8. Lifecycle State Machine

```text
excluded -> unavailable
included -> disabled -> enabling -> enabled -> disabling -> disabled
                       |                    |
                       +------ failed <-----+
```

Enable allocates a fresh monotonic generation; validates manifest, dependencies, compatibility, and approved grants; opens/migrates storage; creates the binding; stages activation resources; then atomically publishes contributions and enabled state. Failure reverses staged resources and revokes the binding.

Disable is terminal for that generation in this exact order:

1. Atomically mark disabling, revoke the binding/generation, and stop admission.
2. Cancel owned jobs and bounded-drain; invalidate schedules, retries, and timers.
3. Remove contributions, subscriptions, callbacks, and frontend publications.
4. Run the plugin disposer while continuing cleanup on error or timeout.
5. Close storage and publish disabled state with any isolated failure record.

Every asynchronous callback, host commit, event emission, query/cache update, toast, contribution update, retry, and result publication carries owner generation and checks it immediately before effect. Re-enable always creates a new generation. Old bindings and callbacks cannot affect the new instance. Disposer failure or timeout cannot restore authority, work admission, contributions, schedules, or storage handles.

## 9. Fixed Contributions

The task implements these exact parent V1 slot IDs only:

```text
app.routes
app.navigation
app.commandPalette
settings.sections
library.toolbarActions
library.rowActions
library.detailSections
library.filters
import.sources
reader.toolbarActions
reader.selectionActions
reader.sidePanels
reader.annotationDecorators
export.formats
paper.detailActions
jobs.renderers
```

Each contribution has stable ID, manifest owner, slot, ordering metadata, required operation declaration, and disposal ownership. Duplicate owner/slot IDs fail activation before publication. V1.1 `reader.contentModes` and `app.workspaceSurfaces` are not added here.

## 10. Inclusion, Disable, and Pruning Fixture

The same local fixture manifest drives two artifact profiles:

| Profile | Expected result |
| --- | --- |
| core-only | fixture manifest, frontend entry/chunk, backend command slice, Rust feature symbol, fixture-only marker/dependency, and runtime row are absent |
| fixture-included/disabled | code is present; no contributions, jobs, storage handles, or network activity are active |
| fixture-included/enabled | exactly the resolved entries activate once under one live generation |

Artifact inspection uses deterministic marker and dependency assertions in addition to bundle reports, so route hiding does not count as pruning. This task proves physical exclusion for the fixture. `mono-build-pruning` later applies the same generated inclusion contract to all first-party plugin code and native dependencies without defining a second manifest.

## 11. Validation Matrix

| Condition | Required result |
| --- | --- |
| malformed/contradictory manifest | build/runtime validation fails with field-specific diagnostic |
| forged ID or binding | Rust rejects before operation and records redacted denial |
| stale generation | no dispatch, commit, publication, retry, or cache/UI update |
| capability denied/out of scope | no underlying operation; stable audited error |
| activation/migration failure | staged resources rolled back; binding revoked; core starts |
| disable with active/non-cooperative job | revoke first; cancel/drain boundedly; late result ignored |
| disposer throws/times out | cleanup continues; disabled is terminal |
| proposal stale/tampered/replayed | no user-content mutation; conflict/invalid result recorded |
| secret/network misuse | no secret value exposure; unapproved host/redirect rejected |
| core-only startup | zero requests and complete core startup |
| core-only fixture artifact | all fixture entries and marker/dependency absent |

## 12. Required Tests

- Manifest schema/compiler, semver, dependency order/cycles, contradiction, generated-registry agreement, and stale inclusion-plan tests.
- Rust binding/reference-monitor tests for missing, forged, stale, disabled, cross-plugin, wrong-operation, wrong-resource, and revoked authority.
- Local fixture tests for staged publish, render isolation, sidecar migration/rollback, host jobs/events/execution, repeated cycles, concurrent disable, cancellation timeout, delayed completion, and disposer failure.
- Proposal tests for conflict, tamper, replay, interrupted apply, owner disable, and idempotent recovery without direct plugin writes to user content.
- Privileged grant tests for scope/limits/consent, host and redirect checks, secret-reference-only application, redaction, cancellation, and revocation.
- Core-only and fixture-included artifact/E2E tests proving zero network, core usability, runtime cleanup, retained data, and physical fixture exclusion.
