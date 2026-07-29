# Build Plugin Host and SDK

## Goal

Provide a typed, least-privilege plugin host that can include and independently enable or disable source-built plugins without granting them ambient LitFolio authority. Establish the canonical manifest/build contract, Rust-resolved instance authority, host-owned lifecycle services, and a local-only fixture before adding privileged capability families.

## Dependencies

- `mono-core-boundaries`, `mono-reader-annotations`, and `mono-ai-reading-core` are completed and archived.
- Parent `PluginManifestV1`, authority, execution, proposal, job, storage, build, and rollback contracts are approved.
- Core proposal and execution persistence used by plugins is available through host-owned services; this task may add plugin ownership fields or adapters but must not create a parallel plugin ledger.

## Requirements

- **HOST-001 - Canonical manifest:** Use the parent-owned `PluginManifestV1` as the only manifest schema. It declares API version, stable ID/version/core API range/display name, frontend/backend activation entries, dependencies, requested capabilities, contributions, storage, migrations, and frontend/Cargo build entries. Generated frontend, Rust, runtime, mock, fixture, and resolved-inclusion registries must derive from the same validated manifest set.
- **HOST-002 - Source/build inclusion:** Discover only source/build-time plugins. Reject duplicate IDs, incompatible ranges, dependency cycles, unsupported capabilities, contradictory activation/build declarations, and stale resolved-inclusion plans before activation or conversion. Runtime package download, dynamic binary loading, and independent plugin processes are excluded.
- **HOST-003 - Opaque authority:** After validation, the host issues an opaque instance binding for one enabled plugin generation. Host-owned frontend transport attaches it; Rust resolves it to immutable plugin identity, generation, and granted operations before every plugin-attributed operation. Caller-supplied IDs, routes, manifests, or frontend permission metadata never authorize work.
- **HOST-004 - Operation-level grants:** Replace broad capability labels with typed operation grants containing resource scope, limits/quotas, consent policy, execution-record redaction, and revocation behavior. No grant implicitly includes another grant.
- **HOST-005 - Minimal local host:** First implement only canonical manifests, lifecycle/reference monitoring, fixed UI registration, logger/i18n/events, scoped sidecar storage, host jobs, and execution records required by a local-only fixture. Privileged paper/annotation/Reader/AI/file/network/secret/schedule operations follow as separate capability slices.
- **HOST-006 - Core-owned control records:** Jobs, execution records/events, and user-content mutation proposals are core/host-owned. Plugins can request work and emit bounded progress through typed services but cannot create an unaudited scheduler, suppress or rewrite required execution history, or directly apply proposals. The host binds cancellation tokens to real execution and coalesces high-frequency progress to interval/meaningful-change persistence while flushing terminal states immediately.
- **HOST-007 - Proposal-only user-content mutation:** Plugin output that would alter user-authored notes, annotations, tags, metadata, accepted documents, or research artifacts creates a revision/hash-bound proposal. Core rechecks live binding, grant, target ownership, digest, base state, and idempotency receipt when applying it; conflicts never silently overwrite or rebase.
- **HOST-008 - Scoped storage:** Plugin data lives in `plugins/<plugin-id>/data.db` through a host-owned scoped service. Plugins receive neither database paths nor raw SQLx pools and cannot access `library.db`, another plugin sidecar, or a filesystem root.
- **HOST-009 - Generation-safe lifecycle:** Disable first revokes the current generation and rejects new work, then cancels and bounded-drains owned jobs, removes schedules/contributions/subscriptions/retries, invokes the disposer, closes storage, and publishes terminal disabled state. Every callback, commit, event, cache update, toast, timer, retry, and result publication must pass a current-generation check; stale results are discarded.
- **HOST-010 - Failure isolation:** Compatibility, migration, activation, render, job, proposal, disable timeout, and disposer failures return structured errors and cannot prevent core startup or leave authority/contributions active.
- **HOST-011 - Forbidden public surface:** The V1 SDK exposes no process spawn, shell, MCP runtime, local daemon/TCP RPC, generic Tauri `invoke`, arbitrary command adapter, raw `AppState`, raw SQLite/SQLx access, raw library/plugin path, keyring handle, secret value, dynamic library, or unsigned binary loading.
- **HOST-012 - Local-only fixture:** Include a deterministic fixture with no network, secret, process, or external-service dependency. It proves canonical inclusion, local UI/storage/events/jobs/execution behavior, activation rollback, repeated enable/disable, stale-result rejection, and core-only physical exclusion of its frontend/backend entries and fixture-only marker/dependency.

## Constraints

- Disabled plugin data is retained by default; disable is not uninstall.
- Build-time exclusion must omit the fixture manifest, frontend entry/chunk, backend command slice/feature, and fixture-only marker/dependency. Broader first-party dependency pruning remains owned by `mono-build-pruning` and must consume this task's canonical generated registry rather than introducing another manifest.
- Tauri commands remain compile-time registered. Plugin-attributed backend operations enter only through feature-gated typed command slices and the Rust reference monitor.
- Capability consent and enablement are distinct: enabling a plugin does not silently approve every requested privileged grant.
- Core startup and the local-only fixture perform zero network requests; no schedule is created merely by activation.
- Historical migrations `0001` through `0035` remain unchanged.

## Out of Scope

- Third-party marketplace, signed package installation, update distribution, physical runtime uninstall, or arbitrary runtime-loaded code.
- Extracting production first-party features into plugins.
- Generic agent/tool loops, process tools, shell tools, MCP, local servers, or binary plugins.
- Final pruning of every production plugin dependency; this task proves the contract with its fixture artifact.
- V1.1 Reflow, generic workspace surfaces, session restoration, and rich source-aware editing contributions.

## Acceptance Criteria

- [ ] One `PluginManifestV1` fixture set generates byte-for-byte consistent frontend, Rust, runtime, mock, fixture, and resolved-inclusion registries; malformed and contradictory manifests fail before build or activation with field-specific diagnostics.
- [ ] A compatible local fixture activates once; all declared contributions appear once; its scoped rows persist; its host-owned job and execution events are visible; disable removes all live resources while core remains usable.
- [ ] Forged plugin IDs, missing bindings, bindings from arbitrary route code, revoked bindings, and previous-generation bindings fail in Rust with stable structured errors and redacted execution records.
- [ ] Repeated enable/disable and concurrent disable with delayed work leak no routes, listeners, schedules, jobs, storage handles, timers, query publications, or duplicate contributions; re-enable uses a new generation.
- [ ] Under the pinned 100-job cancellation/progress fixture, cancel-to-stop p99 is `<= 250 ms` outside non-interruptible OS calls, no acknowledged-cancel job can commit/publish success, UI event p95 is `<= 100 ms`, and 2,000 raw ticks/s persist at most 500 progress updates/s while terminal states are durable before acknowledgment.
- [ ] Missing dependency, incompatible API, denied grant, duplicate contribution ID, migration failure, activation failure, cancellation timeout, proposal conflict/replay, and disposer failure remain isolated and terminal.
- [ ] Storage traversal/symlink attempts, core/other-plugin database access, secret reads, raw paths, generic invoke, process/shell/TCP attempts, and undeclared capability operations are absent from the SDK or rejected before the underlying operation.
- [ ] Privileged capability contract tests enforce host/resource scope, limits, consent, redirect revalidation, secret-reference-only use, audit redaction, cancellation, and revocation without exposing credentials.
- [ ] Plugin attempts to modify user-authored/core-owned content produce proposals; stale, tampered, replayed, disabled-owner, and interrupted apply cases cannot silently mutate content.
- [ ] Core-only startup and idle instrumentation record zero network requests and pass with no included/enabled plugins and with a broken plugin excluded or disabled.
- [ ] A core-only production fixture artifact contains no fixture manifest, entry/chunk, command slice, Rust feature symbol, or fixture-only marker/dependency; the included-fixture artifact contains exactly the resolved entries.
- [ ] SDK type tests, manifest compiler tests, host lifecycle tests, backend authority/storage tests, frontend slot tests, command-parity tests, typecheck, lint, Vitest, focused Cargo tests, artifact inspection, and fixture E2E pass.

## Source Anchors

- `src/App.tsx`, `src/lib/navigationRegistry.ts`, `src/components/CommandPalette.tsx`
- `src/components/Shell.tsx`, `src/pages/SettingsPage.tsx`, `src/pages/ReaderPage.tsx`
- `src/lib/apiInvoke.ts`, `src/lib/tauriCommandParity.test.ts`
- `src-tauri/src/lib.rs`, `src-tauri/src/commands/mod.rs`, `src-tauri/src/startup.rs`
- `src-tauri/src/storage/paths.rs`, `src-tauri/Cargo.toml`, `vite.config.ts`
- `.trellis/tasks/07-23-litfolio-mono/design.md` sections 6 through 8
- `.trellis/tasks/07-28-mono-neuink-integration-study/research/mono-plan-adversarial-review.md`
