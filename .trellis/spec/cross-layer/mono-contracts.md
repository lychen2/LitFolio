# Canonical Target Mono Contracts

## Purpose

Own the single planned `target-mono-v1` contract catalog consumed by later TypeScript, Rust, host/runtime, build, mock, and conversion implementations.

## Status

**Planned and unimplemented.** Current product code does not implement these types, registries, authority checks, or job envelopes. JSON fixtures under [`fixtures/mono-v1/`](./fixtures/mono-v1/) are design conformance inputs, not evidence of runtime behavior.

## Current Implementation

- There is no plugin manifest compiler, host-issued plugin binding, generated inclusion registry, or scoped plugin grant.
- Core IDs and command payloads are domain-specific strings/numbers rather than a shared cross-language reference envelope.
- Migration `0001` defines `ai_jobs`; migration `0033` defines generic `jobs`. Current `JobRecord` has kind, scope, status, JSON details, progress, attempts, and timestamps, but no owner, plugin generation, event sequence, execution correlation, or persisted cancellation record.
- `src-tauri/src/storage/jobs.rs` recognizes terminal status strings, but current methods can update progress or transition after terminal completion. Its retry creates another queued attempt in the same row. This is deliberately separate from the target below.

## Planned Parent Contract

### Contract and fixture version

Every cross-language value below carries `contractVersion: "target-mono-v1"` where it can cross or persist independently. Every conformance fixture carries:

```text
fixtureVersion, fixtureId, kind, status, input, expected
```

`status` is exactly `planned-unimplemented` until product consumers land. Fixture IDs are unique and stable; changing a fixture expectation is a contract revision, not a consumer-local workaround. JSON object member names are unique at every nesting depth; fixture and consumer loaders reject a duplicate member before schema validation instead of accepting a parser-specific first or last value.

### Canonical PluginManifestV1

This section is the only Trellis spec definition of `PluginManifestV1`. Other specs link here.

```ts
interface PluginManifestV1 {
  apiVersion: 1;
  id: string;
  version: string;
  coreApi: string;
  displayName: string;
  activation: {
    frontend?: { export: string };
    backend?: { commandSlice: string };
  };
  dependencies: Array<{
    id: string;
    version: string;
    optional: boolean;
  }>;
  requestedCapabilities: Array<{
    capability: CapabilityName;
    operations: string[];
    required: boolean;
    scope: {
      resourceDomains: DomainName[];
      contributionSlots: ContributionSlot[];
      jobKinds: string[];
    };
    limits: {
      maxUnitsPerRequest: number;
      maxUnitsPerWindow: number;
    };
  }>;
  contributions: Array<{
    id: string;
    slot: ContributionSlot;
    frontendExport: string;
    requiredOperations: string[];
    order: number;
  }>;
  storage: {
    kind: "none" | "sidecar-sqlite";
    schemaVersion: number;
    retention: "preserve-on-disable";
  };
  migrations: Array<{
    id: string;
    fromVersion: number;
    toVersion: number;
    backendExport: string;
    sha256: string;
  }>;
  build: {
    frontendEntry?: string;
    rustFeature?: string;
  };
}
```

Allowed capability names are `papers`, `annotations`, `reader`, `ai`, `storage`, `files`, `network`, `secrets`, `jobs`, `events`, `ui`, `i18n`, and `logger`. Every operation uses this ASCII grammar:

```text
operation = capability "." segment ("." segment)*
segment = [a-z][a-z0-9]*("-"[a-z0-9]+)*
```

`capability` is exactly one allowed capability name. Manifest operations must use the capability declared by their enclosing request. The same grammar applies to manifest request lists, host-issued grants, and operation requests. Empty operations, leading dots, unknown capability prefixes, empty/consecutive-dot segments, leading digits, uppercase letters, underscores, and leading/trailing hyphens are invalid. Canonical operations such as `storage.read`, `storage.write`, `jobs.submit`, `jobs.cancel`, and `ui.register` conform; a capability name alone is not an operation or grant.

Allowed V1 contribution slots are `app.routes`, `app.navigation`, `app.commandPalette`, `settings.sections`, `library.toolbarActions`, `library.rowActions`, `library.detailSections`, `library.filters`, `import.sources`, `reader.toolbarActions`, `reader.selectionActions`, `reader.sidePanels`, `reader.annotationDecorators`, `export.formats`, `paper.detailActions`, and `jobs.renderers`.

Manifest invariants:

- `id` matches `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`; versions are SemVer 2 using ASCII `[0-9]` digits only, including valid prerelease/build forms. V1 dependency/core ranges are one SemVer 2 value optionally prefixed by `^` or `~`.
- Frontend activation requires `build.frontendEntry`, and the activation `frontend.export` must be the executable export named by that entry. Every frontend contribution requires frontend activation, the same build entry, and a non-empty `frontendExport` that resolves through that activation surface. Backend activation requires `build.rustFeature`, and its `commandSlice` must be the executable backend slice selected by that feature. Every backend migration requires backend activation, its command slice, that Rust feature, and a non-empty `backendExport` resolved by the slice. A build entry/feature without its matching activation declaration, or an activation executable without its matching build declaration, is a contradiction.
- Every dependency declaration validates its ID, range, and `optional` scalar before inclusion lookup. This includes required and optional dependencies absent from the selected manifest set. Dependency IDs differ from the owner, resolve uniquely when required, satisfy their ranges when present, and form an acyclic required-dependency graph. Required dependencies are emitted in deterministic dependency-first topological order. Plugin-ID lexical order breaks ties only among plugins whose required dependencies have already been emitted.
- Requested capabilities are unique by capability, operation strings are unique across the manifest, and contribution `requiredOperations` are unique declared requests. Scope arrays are unique and use only canonical domains/V1 slots plus non-empty declared job kinds. Both limits are positive JSON integers; booleans are never integers. Declarations never authorize runtime work.
- Contribution IDs are unique within the plugin; slots are from the fixed V1 set; activation/contribution frontend exports and migration backend exports are non-empty and unique; order is deterministic.
- `storage.kind = "none"` requires schema version `0` and no migrations. `sidecar-sqlite` requires a positive schema version and one contiguous, non-branching migration chain from `0` to that version with unique IDs, backend exports, and lowercase 64-character SHA-256 values.
- Unknown fields fail validation. This prevents one consumer from silently accepting declarations another ignores.

### Resolved inclusion and registry agreement

A compiler validates the complete manifest set, resolves dependencies, emits plugins in that dependency-first topological order, and produces one `ResolvedPluginInclusionPlanV1`. It must not globally re-sort the resolved output by plugin ID. The plan deterministically supplies:

- frontend entries: plugin ID, build entry, and activation export;
- Rust features: plugin ID and Cargo feature;
- backend slices: plugin ID and activation command slice;
- runtime entries: plugin ID/version and frontend/backend activation flags;
- mocks: plugin ID and the generated frontend/backend surfaces to mock;
- conversion owners: plugin ID, storage kind/schema version, and migration IDs.

The compile input pins one exact ASCII SemVer 2 `targetCoreApiVersion`, not a range. It is a required compile input and must itself satisfy the V1 SemVer grammar. Every selected manifest's `coreApi` range must include that exact version before any activation, contribution, migration, or registry output is emitted; otherwise compilation fails with `plugin_incompatible`. The target version is part of the resolved plan and its digest input, so a plan cannot be replayed against a different core API. A manifest's `coreApi` declaration is compatibility metadata only; it does not change the pinned target or grant access to host APIs.

Every output records the same plan digest. The digest is lowercase SHA-256 over `MonoCanonicalJsonV1` bytes for an object containing `contractVersion`, `targetCoreApiVersion`, and the dependency-ordered full manifest values. The golden registry fixture pins the exact expected outputs and digest; consumers may not maintain parallel hand-written lists.

### MonoCanonicalJsonV1 bytes

`MonoCanonicalJsonV1` is the target's deliberately small cross-language JSON byte profile. It is not a claim of RFC 8785 conformance. A conforming encoder:

1. accepts only schema-validated JSON values; object member names, manifest IDs, domain/resource IDs, operation segments, and other schema-declared identifiers are ASCII, object members are unique, and every numeric schema field is an integer in the JavaScript safe range `[-9007199254740991, 9007199254740991]` before its narrower positive/non-negative rule is applied;
2. preserves identifier and object-key bytes exactly as their validated ASCII spelling, normalizes every other string value to Unicode NFC, rejects lone UTF-16 surrogate code points, preserves array order, and orders object members by ascending ASCII/UTF-8 key bytes;
3. emits `null`, `true`, `false`, and base-10 integers without whitespace or leading plus/zero padding;
4. emits `\"`, `\\`, `\b`, `\t`, `\n`, `\f`, and `\r` for those characters, lowercase `\u00xx` for the remaining U+0000 through U+001F controls, and does not escape `/` or other Unicode scalar values; and
5. encodes the resulting text as UTF-8 without a BOM before SHA-256.

The canonical byte algorithm therefore defines exact bytes, not merely semantic JSON equivalence: key ordering is deterministic, array order is significant, ASCII keys/identifiers cannot be rewritten through Unicode normalization, and all other string values use NFC before escaping. Source JSON escape spelling is irrelevant, and canonically equivalent NFC/NFD input strings produce the same value bytes. The valid manifest fixture includes a Unicode `displayName` and pins its canonical UTF-8 bytes. Named probes reject non-integer numbers and prove literal-versus-escaped and NFC-versus-NFD byte agreement.

### Stable core domain and resource references

```ts
interface DomainRefV1 {
  contractVersion: "target-mono-v1";
  domain: "paper" | "annotation" | "document-revision" |
    "source-segment" | "note" | "job";
  id: string;
}

interface ResourceRefV1 {
  contractVersion: "target-mono-v1";
  resource: DomainRefV1;
  revision: null | {
    kind: "number" | "sha256";
    value: string;
  };
}
```

IDs are non-empty, stable, opaque ASCII identifiers, not paths or database row handles. A numeric revision is a base-10 non-negative integer encoded as a string; a SHA-256 revision is 64 lowercase hex characters. Cross-language round trips preserve the JSON value exactly and reject unknown domains/fields.

### Declarations versus host-issued grants

A manifest's ID and requested capabilities are descriptive inputs. They never become runtime authority. The host issues an opaque binding and resolves it server-side to a principal and immutable grants:

```ts
interface PluginPrincipalV1 {
  contractVersion: "target-mono-v1";
  pluginId: string;
  pluginVersion: string;
  generation: number;
}

interface PluginGrantV1 {
  contractVersion: "target-mono-v1";
  grantId: string;
  principal: PluginPrincipalV1;
  operation: string;
  resourceScope: {
    resources: ResourceRefV1[];
  };
  limits: {
    maxUnitsPerRequest: number;
    maxUnitsPerWindow: number;
  };
  consent: "activation" | "per-use" | "approved-schedule";
  grantApprovalEvidenceId: string;
  redaction: "metadata-only" | "content-summary";
  revocation: "cancel" | "drain-read-only" | "reject-result";
}

interface PluginOperationRequestV1 {
  operation: string;
  resource: ResourceRefV1;
  units: number;
}
```

`generation` is a positive host-issued JSON integer. A plugin-attributed request is admitted only after an opaque binding resolves to a live matching principal and one grant with the exact operation. The request resource must equal one `resourceScope.resources` value as `MonoCanonicalJsonV1`, including revision, and `units` must be positive and no greater than `maxUnitsPerRequest`. Caller `pluginId`, manifest contents, route ownership, contribution metadata, frontend permission state, clock values, quota consumption, reservations, or consent claims cannot substitute for host state. Unknown request fields fail closed, so a caller-supplied `consumedUnitsInWindow`, window timestamp, reservation, or consent assertion is denied with `permission_denied`.

Quota admission uses one persisted host-owned ledger keyed by `(grantId, principal generation, windowStartMs)`. V1 windows are fixed, UTC-epoch-aligned half-open intervals of exactly `60_000` milliseconds: `windowStartMs = floor(hostAdmissionTimeMs / 60_000) * 60_000`. In one atomic transaction or equivalent compare-and-swap loop, the host:

1. resolves the live binding/grant and verifies scope and consent;
2. reads committed units plus all active reservations for the current ledger key;
3. rejects when `committed + reserved + requested > maxUnitsPerWindow`; or
4. persists a unique reservation and, for per-use/scheduled evidence, consumes that evidence before exposing the dispatch capability.

Concurrent admissions serialize on that ledger key or retry after a compare-and-swap conflict, so both cannot observe the same remaining quota. Dispatch starts only after reservation persistence. Success converts reserved units to committed units atomically; pre-dispatch denial or failed/cancelled work releases the reservation according to the operation policy, and a crash-recovery pass resolves durable reservations without trusting plugin reports. Old-window rows are retained/audited or pruned by the host but never counted in the current window.

Every grant's `grantApprovalEvidenceId` resolves in the host consent store to unexpired, non-revoked evidence bound to the exact grant, binding principal, generation, scope, limits, and consent policy. `activation` admission uses that evidence. `per-use` additionally requires a fresh host UI evidence record bound to the exact operation/resource/unit request; it is consumed atomically with reservation. `approved-schedule` additionally requires a host scheduler dispatch and unconsumed schedule-occurrence evidence bound to the approved schedule, operation, resource, units, and execution time; a plugin-created timer, schedule ID, or consent claim is not evidence. Missing, expired, mismatched, reused, or caller-invented evidence returns `permission_denied` and creates no reservation or dispatch.

Scope denial returns `scope_not_approved`; either limit denial returns `operation_limit_exceeded`; neither dispatches. A missing binding returns `plugin_instance_missing`; a revoked binding or principal generation different from the host's active generation returns `plugin_instance_stale`; a live binding without the operation returns `permission_denied`. Bindings and secret values are never persisted in fixtures or execution records.

### Persisted jobs, events, cancellation, and terminal outcome

A job owner is discriminated:

```ts
type JobOwnerV1 =
  | { kind: "core"; component: string }
  | { kind: "plugin"; pluginId: string; pluginVersion: string; generation: number };

type JobStateV1 = "queued" | "running" | "cancelling" | "terminal";
type JobTerminalV1 = "succeeded" | "failed" | "cancelled" | "interrupted";
```

`JobRecordV1` persists `contractVersion`, stable job ID, immutable owner, typed kind, trigger, state, progress, execution correlation ID, cancellation record, created/started/updated/finished timestamps, and either `terminal: null` or one redacted terminal result. Plugin owners require a positive generation; core owners never carry one.

`JobEventV1` persists job ID, strictly increasing positive `seq`, timestamp, event kind, resulting state, and bounded redacted data. Consumers enforce:

- owner is immutable for the job;
- every event carries the record's exact job ID and contract version;
- event sequence is strictly increasing with no duplicate or decreasing value;
- the first event is `queued`; `started` permits `queued -> running`; `progress` permits `running -> running`; and `cancellation_requested` permits `queued|running -> cancelling` exactly once;
- `succeeded` and `failed` terminal events permit `running -> terminal`, `cancelled` permits `cancelling -> terminal`, and `interrupted` permits `queued|running|cancelling -> terminal`; no other state/event transition is legal;
- accepted cancellation has one `cancellation_requested` event, an exact matching record timestamp/reason, and either remains `cancelling` or ends `cancelled`/`interrupted`;
- queued, running, and cancelling records have `terminal: null`, `finishedAt: null`, and no terminal event; terminal records have exactly one final terminal event, exactly one matching terminal outcome, and matching `finishedAt`;
- timestamps are non-negative JSON integers, event timestamps are non-decreasing in sequence order, the first/last event match `createdAt`/`updatedAt`, `startedAt` matches the sole `started` event, and nullable timestamps obey `createdAt <= startedAt <= finishedAt` when present;
- progress event `current` and `total` are non-negative JSON integers with `current <= total`; across progress events, neither value decreases; the record progress equals the latest progress event exactly, or has `current = 0` before any progress event;
- no event, progress update, commit, retry, or publication is accepted after terminal;
- plugin work commits/publishes only while the recorded owner generation remains live.

Retry creates a new job/attempt identity linked through redacted metadata; it does not reopen a terminal event stream.

### Structured contract errors

Target consumers return a stable code, optional field path/correlation ID, and redacted details. The canonical target error catalog is fixture-owned in [`errors-catalog.json`](./fixtures/mono-v1/errors-catalog.json); invalid fixtures reference those exact codes. It covers manifest/dependency validation, plugin lifecycle and compatibility, host authority, scope/limits, proposals, resources, jobs, and startup-network conformance. Parent and host task plans link this catalog instead of owning narrower error-code unions. Errors never contain bindings, secrets, raw paths, SQL, or private document excerpts.

## Source Examples

Current evidence: `src-tauri/migrations/0001_init.sql`, `0033_jobs.sql`, `src-tauri/src/storage/jobs.rs`, `src-tauri/src/commands/jobs.rs`, `src/lib/apiSchema.ts`, and `src/test/tauriMockCommands.ts`.

Planning sources: `.trellis/tasks/07-23-litfolio-mono/prd.md`, `.trellis/tasks/07-23-litfolio-mono/design.md`, `.trellis/tasks/07-23-mono-core-boundaries/design.md`, and `.trellis/tasks/07-23-mono-plugin-host-sdk/design.md`. This specification remains the sole schema and fixture owner; the task documents retain their task-specific behavioral and implementation responsibilities.

## Validation

```bash
python3 .trellis/spec/cross-layer/fixtures/mono-v1/validate.py
rg -n '^interface PluginManifestV1|^type PluginManifestV1' .trellis/spec .trellis/tasks/07-23-litfolio-mono .trellis/tasks/07-23-mono-plugin-host-sdk .trellis/tasks/07-23-mono-build-pruning
rg -n 'owns the.*target.*(manifest|resource|job)|only Trellis spec definition' .trellis/spec
```

Later TypeScript and Rust consumers must run every valid round trip and invalid case by fixture ID and report the consumer name on disagreement. The validator executes named negative mutations for strict scalar/nested-field handling, ASCII-only SemVer 2 and absent-dependency ranges, activation/build/contribution/migration coherence, compile-target compatibility, duplicate JSON members at nested depth, `MonoCanonicalJsonV1` escaping/NFC/integer behavior, operation grammar across declarations/grants/requests, duplicate operations/exports, required-dependency cycles, host-owned consent/quota/reservation/generation admission, progress projection/monotonicity, job transitions/cancellation/timestamps/terminality, closed error-catalog metadata, and complete startup observer/control evidence.

## Anti-Patterns

- Defining a reduced TypeScript, Rust, build, mock, or converter manifest.
- Treating requested capabilities or a caller plugin ID as a grant.
- Trusting caller-reported quota/window/reservation state or caller-created consent/schedule evidence.
- Putting raw paths, SQL identifiers, secret values, or bindings in stable resource references.
- Reusing the current `jobs` row as proof of target event terminality.
- Reopening a terminal job, accepting duplicate/post-terminal events, or omitting plugin generation.
- Editing fixture expectations in one consumer to make its private parser pass.

## Related Specs

- [Cross-Layer Index](./index.md)
- [Plugin Capabilities](./plugin-capabilities.md)
- [Startup Network](./startup-network.md)
- [Cross-Layer API Contracts](./api-contracts.md)
- [Storage and Migrations](../backend/storage-and-migrations.md)
