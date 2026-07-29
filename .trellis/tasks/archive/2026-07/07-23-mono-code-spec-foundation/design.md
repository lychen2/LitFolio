# Establish Mono Code Specifications - Design

## 1. Scope / Trigger

Run after `00-bootstrap-guidelines` has produced real frontend guidance and before `mono-core-boundaries` starts. This task makes the current repository conventions loadable and checkable; it does not implement the Mono target.

## 2. Signatures

Required spec entrypoints:

```text
.trellis/spec/backend/index.md
.trellis/spec/backend/tauri-commands.md
.trellis/spec/backend/storage-and-migrations.md
.trellis/spec/backend/error-handling.md
.trellis/spec/cross-layer/index.md
.trellis/spec/cross-layer/api-contracts.md
.trellis/spec/cross-layer/plugin-capabilities.md
.trellis/spec/cross-layer/reader-annotations.md
.trellis/spec/cross-layer/mono-contracts.md
.trellis/spec/cross-layer/startup-network.md
.trellis/spec/cross-layer/fixtures/mono-v1/*.json
```

Each document uses this minimum contract:

```text
Purpose -> Current Rules -> Source Examples -> Validation -> Anti-Patterns -> Related Specs
```

`plugin-capabilities.md`, `reader-annotations.md`, `mono-contracts.md`, and `startup-network.md` separate `Current implementation` from `Planned parent contract`; only the former is normative until implementation lands. Target fixtures use an explicit `target-mono-v1` marker and cannot be cited as proof that product code implements the contract.

## 3. Contracts

- Indexes link every owned document and state when to load it.
- Current rules cite repository paths and describe behavior that can be verified now.
- Validation uses existing project commands and focused tests, not hypothetical scripts.
- Historical migrations are immutable; new persistence work adds migrations.
- Frontend invoke names, argument casing, parsers, Rust commands, registration, and mocks form one cross-layer contract.
- Parent/child design documents remain the behavioral authority for their future implementation tasks. The shared target schema and fixture catalog in `mono-contracts.md` is the canonical cross-consumer contract; task documents link to it instead of restating it.
- `mono-contracts.md` owns the target contract catalog. It defines one `PluginManifestV1`, stable resource/domain references, the distinction between requested capabilities and host-issued grants, and versioned job owner/state/event/cancellation/terminal envelopes; other specs link to these definitions instead of cloning them.
- The fixture set is implementation-neutral JSON with unique object members at every depth. Strict loaders reject duplicates before schema validation. It includes a Unicode manifest golden value, activation/build/contribution/migration failures, a pinned core API compile target, a golden resolved inclusion/registry result, and cross-language domain/plugin/job round-trip cases. SemVer uses ASCII `[0-9]`; every dependency range is validated before inclusion lookup. `MonoCanonicalJsonV1` defines deterministic NFC UTF-8 digest bytes without claiming RFC 8785. Operations share one capability-prefixed ASCII segment grammar across declarations, grants, and requests. Host admission uses a 60-second epoch-aligned atomic quota/reservation ledger plus policy-bound consent evidence; plugin requests cannot report quota state or consent. Job-record progress is the exact latest legal monotonic progress projection. Registry compilation uses deterministic dependency-first topological order with lexical tie-breaking only among ready peers. Registry output covers frontend entries, Rust features/backend slices, runtime entries, mocks, and conversion inclusion metadata.
- `errors-catalog.json` is the sole stable target error-code catalog. It covers all parent/host plugin lifecycle, authority, scope/limit, and proposal codes; parent and host plans preserve behavior by linking it, while the fixture validator pins required coverage.
- Manifest identity and requested capabilities are descriptive inputs, never runtime authority. Fixtures must reject treating a caller-provided plugin ID or manifest declaration as a host grant.
- `startup-network.md` records that `src/main.tsx` currently invokes `startAutoUpdateCheck()` and `src/lib/autoUpdate.ts` creates a six-hour timer. Its target contract assigns automatic checks and schedules to `updates`; core may expose a user-triggered adapter but cannot start or schedule it.
- The target network fixture observes cold boot through Reader/Library readiness and a defined 30-second idle window using fake time where appropriate. It counts attempted egress at frontend network primitives, lower-level WebView/process image/style/media/frame/worker requests, navigation and CSP-denied attempts, updater transport, backend host request adapters, and network-capable timers. The core-only expected count is exactly zero; observer completeness is proven by one unique positive control per boundary rather than an asserted unobserved count.

## 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| placeholder remains | task fails |
| broken index link | task fails with path |
| example path missing | task fails with path |
| planned API stated as current | review failure; rewrite section |
| duplicate manifest/type definition | task failure; replace with link to the canonical target contract |
| fixture parses differently across target consumers | conformance failure with fixture ID and consumer |
| updater boot/timer omitted from current-state audit | task failure; startup network ownership is incomplete |
| core-only boot or idle records egress | target conformance failure; identify and gate the owning integration |
| duplicate/conflicting rule | consolidate under one owning spec |
| application source diff appears | revert only task-owned accidental edit; preserve user work |

## 5. Good / Base / Bad Cases

- Good: a command rule links `commands/mod.rs`, API invoke/parsers, parity test, and Tauri mock, then gives the exact checks.
- Base: a directory rule names the owner and allowed dependency direction with one current example.
- Good target fixture: one manifest input has a checked golden result shared by frontend, Rust, runtime, build, mock, and conversion consumers and is labeled unimplemented until those consumers land.
- Good startup contract: current boot updater behavior is cited, while the target test separately proves zero observed core egress through readiness and idle.
- Bad: "plugins use sidecar databases" appears as current behavior before any plugin host exists.
- Bad: a second TypeScript-only `PluginManifest` or a mocked updater test is accepted as proof of process-wide zero-network startup.

## 6. Tests Required

- `rg -n "To be filled by the team|TBD" .trellis/spec`
- Markdown link/path resolution for all spec indexes plus duplicate normalized-anchor detection across ATX and Setext H1/H2 headings.
- Schema/fixture validation proving strict duplicate-member rejection, ASCII SemVer and identifiers, absent-dependency range checks, activation/build/contribution/migration coherence, pinned core API compatibility, `MonoCanonicalJsonV1` escaping/NFC/integer behavior, operation grammar, atomic host-owned quota/reservation and consent admission, exact monotonic job progress projection, unique fixture IDs, expected error codes, complete stable-code coverage, deterministic dependency-first registry output, and internally consistent golden outputs.
- Duplicate-definition scans for `PluginManifestV1` and target domain/plugin/job contract ownership.
- A documented executable test recipe for `core_boot_without_plugins_has_no_network_requests` and `disabled_update_plugin_has_no_timer_or_network_request`; execution belongs to `mono-core-boundaries` and later integration gates.
- `python3 ./.trellis/scripts/get_context.py --mode packages`.
- Trellis context validation for this child and the next dependency-ready child.
- Diff check proving only `.trellis/spec/` and this task's planning/context files changed.

## 7. Wrong vs Correct

Wrong:

```md
All plugin commands are capability-guarded.
```

This is not implemented yet.

Correct:

```md
Current: all Tauri commands are statically registered through the macro chain in
`src-tauri/src/commands/mod.rs`. Planned capability guards are defined by the
Mono parent design and become normative only after the plugin-host task lands.
```

The same distinction applies to `PluginManifestV1`, job ownership/cancellation, generated registries, and zero-network startup: this task makes their target contracts executable as specifications and fixtures, not as product behavior.
