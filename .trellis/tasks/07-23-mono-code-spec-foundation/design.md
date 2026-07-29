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
- Parent/child design documents remain the authority for future Mono behavior until promoted with `trellis-update-spec`.
- `mono-contracts.md` owns the target contract catalog. It defines one `PluginManifestV1`, stable resource/domain references, the distinction between requested capabilities and host-issued grants, and versioned job owner/state/event/cancellation/terminal envelopes; other specs link to these definitions instead of cloning them.
- The fixture set is implementation-neutral JSON. It includes a minimal valid manifest, field/dependency/build failures with expected stable error codes, a golden resolved inclusion/registry result, and cross-language domain/plugin/job round-trip cases. Registry output covers frontend entries, Rust features/backend slices, runtime entries, mocks, and conversion inclusion metadata.
- Manifest identity and requested capabilities are descriptive inputs, never runtime authority. Fixtures must reject treating a caller-provided plugin ID or manifest declaration as a host grant.
- `startup-network.md` records that `src/main.tsx` currently invokes `startAutoUpdateCheck()` and `src/lib/autoUpdate.ts` creates a six-hour timer. Its target contract assigns automatic checks and schedules to `updates`; core may expose a user-triggered adapter but cannot start or schedule it.
- The target network fixture observes cold boot through Reader/Library readiness and a defined 30-second idle window using fake time where appropriate. It counts attempted egress at frontend network primitives, updater transport, and backend host request adapters; the core-only expected count is exactly zero, and an unobserved egress path blocks conformance.

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
- Markdown link/path resolution for all spec indexes.
- Schema/fixture validation proving unique fixture IDs, expected error codes, and internally consistent golden registry outputs.
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
