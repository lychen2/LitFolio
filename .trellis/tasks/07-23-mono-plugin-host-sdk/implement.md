# Build Plugin Host and SDK - Implementation

## Entry Gate

- `mono-core-boundaries`, `mono-reader-annotations`, and `mono-ai-reading-core` are completed and archived.
- Parent `PluginManifestV1`, opaque binding, typed grant, execution, proposal, job, lifecycle, build, and rollback contracts remain approved.
- Existing core proposal/execution/job storage ownership is identified before adding plugin adapters; this task must extend or reuse it, not create parallel ledgers.

## Stage A - Canonical Manifest and Build Inputs

1. [ ] Add failing schema/type fixtures for the exact parent `PluginManifestV1`, including activation entries, dependencies, requested capabilities, contributions, storage, migrations, and frontend/Cargo build entries.
2. [ ] Implement one manifest compiler and versioned `ResolvedPluginInclusionPlan`; generate frontend entries, Rust features/command slices, runtime registry inputs, mocks, fixtures, and conversion ownership metadata from its digest.
3. [ ] Reject duplicate IDs, incompatible API/semver ranges, cycles, missing dependencies, unsupported capabilities, contradictory activation/build declarations, and stale inclusion plans before activation or writes.
4. [ ] Add agreement tests proving every generated registry has the same selected IDs, versions, entries, features, and inclusion-plan digest.

**Gate A:** No runtime host or converter consumes handwritten plugin ID arrays or a second manifest shape.

## Stage B - Minimal Local Host and Authority

5. [ ] Implement the host-owned opaque instance binding and Rust binding registry/reference monitor. Store immutable plugin identity, version, generation, approved operation grants, and cancellation owner with host-controlled live/revoked lifecycle state.
6. [ ] Implement typed frontend transport that attaches the opaque binding without exposing construction, serialization, persistence, or generic invoke; reject arbitrary route callers, forged IDs/tokens, missing bindings, and cross-plugin substitutions.
7. [ ] Implement minimal typed local capabilities only: fixed UI slots, logger/i18n/events, scoped sidecar storage, local host jobs, and core-owned execution records.
8. [ ] Implement sidecar ownership and declared transactional migrations with backup/rollback, path/symlink/attached-database denial, and no raw pool/path/SQL surface.
9. [ ] Implement transactional activation: validate first, allocate a fresh generation, stage resources, publish atomically, and reverse all host-owned registrations on failure.
10. [ ] Add the deterministic local-only fixture with one declaration in every fixed V1 slot, local storage/events/jobs/execution behavior, denied privileged/forbidden-operation requests with no underlying dispatch, and controlled malformed, migration-failure, partial-activation, duplicate-contribution, delayed-job, non-cooperative-job, and disposer-failure variants.

**Gate B:** The fixture activates without network/secrets/files/AI/schedules/processes, contributions publish once, core starts when variants fail, and every backend operation proves a Rust-resolved live binding.

## Stage C - Terminal Disable and Fixture Pruning

11. [ ] Implement disable in the required order: revoke generation/admission; cancel and bounded-drain jobs; invalidate schedules/retries/timers; remove contributions/subscriptions/publications; run disposer; close storage; publish terminal disabled state.
12. [ ] Add generation checks immediately before every callback effect, commit, event, cache/query update, toast, timer/retry, contribution update, and result publication; prove old callbacks cannot affect a re-enabled generation.
13. [ ] Persist host-owned job ownership and real cancellation-token bindings plus ordered execution events for running, denial, cancellation-requested, cancelled, succeeded, failed, degraded, interrupted, and disable-timeout outcomes. Coalesce progress by fixed interval or meaningful percentage change; flush terminal transitions immediately with monotonic sequence numbers.
14. [ ] Build core-only and fixture-included artifact profiles from the canonical inclusion plan. Assert the core-only artifact omits the fixture manifest, entry/chunk, command slice, Rust feature symbol, fixture marker, and fixture-only dependency.
15. [ ] Add repeated/concurrent enable-disable E2E and artifact inspection; verify retained sidecar data, no live handles/resources, zero startup/idle network, and continued core usability.

**Gate C:** Disposer errors and non-cooperative work cannot preserve authority or effects, and fixture absence is physically proven rather than inferred from hidden UI. The pinned 100-job fixture meets cancel-to-stop p99 `<= 250 ms`, zero post-cancel commit/success, UI event p95 `<= 100 ms`, and at most 500 persisted updates/s under 2,000 raw progress ticks/s.

## Stage D - Privileged Capability Slices

16. [ ] Define operation-specific request/result/grant schemas with resource scope, limits, consent, redaction, and revocation. Add one denied-by-default contract test before each operation handler.
17. [ ] Add local read capabilities for papers, annotations, Reader, and explicit AI context through narrow host/core services; no ambient repository or `AppState` access.
18. [ ] Integrate the core proposal service for plugin-requested changes to notes, annotations, tags, metadata, accepted documents, and research artifacts; test base conflict, tamper, replay, interruption, disable, and idempotent recovery.
19. [ ] Add scoped file-handle operations, then network fetch, secret-reference application, and schedules as separate reviewed slices. Revalidate redirects, keep secret values inside the host adapter, and create execution records before dispatch.
20. [ ] Add SDK compile-fail/import-boundary tests proving no process, shell, MCP, TCP/local-daemon RPC, generic Tauri invoke, arbitrary command, raw DB/SQL, raw path/root, keyring, secret value, dynamic library, or unsigned binary API is reachable.

**Gate D:** Each privileged slice passes scope, consent, audit, cancellation, revocation, and stale-generation tests independently; enabling one operation does not grant another.

## Stage E - Integration and Documentation

21. [ ] Harden every fixed V1 slot host with deterministic order, duplicate ownership checks, render isolation, staged publication, automatic cleanup, and compatibility adapters; do not add V1.1 content-mode/workspace surfaces.
22. [ ] Add command-parity and generated-registry tests for every feature-gated backend slice and mock; no plugin-attributed command bypasses the reference monitor.
23. [ ] Document only the public SDK entrypoints, typed operation catalog, manifest diagnostics, lifecycle guarantees, proposal flow, and explicit forbidden surface.
24. [ ] Run focused and full validation, capture fixture artifact evidence, and preserve static route/command adapters required by later extraction children.

## Validation

```bash
python3 ./.trellis/scripts/task.py validate .trellis/tasks/07-23-mono-plugin-host-sdk
python3 ./.trellis/scripts/task.py list-context .trellis/tasks/07-23-mono-plugin-host-sdk
pnpm typecheck
pnpm lint
pnpm test
pnpm build
(cd src-tauri && cargo test plugin)
pnpm test:e2e -- --grep "fixture plugin|core-only|plugin disable"
pnpm bundle:report
```

Artifact checks must inspect generated frontend and Rust registries plus built outputs for fixture IDs, deterministic marker strings, command/feature symbols, chunks, and the fixture-only dependency. Exact helper commands are added with the implementation because bundle and native artifact paths are platform-dependent.

## Rollback Gates

- Do not open or migrate sidecar storage before manifest, dependency, binding, and grant validation passes.
- Do not publish contributions or permit backend work before staged activation and Rust binding-resolution tests pass.
- Do not add privileged capabilities before the local-only fixture passes activation rollback, repeated disable, stale-result blocking, job drain, execution-record, and core-only artifact tests.
- Do not expose a direct mutation capability when the target is user-authored/core-owned content; use the core proposal service.
- Do not let production features depend on the host until the fixture proves local inclusion, terminal disable, core-only startup, and physical artifact exclusion.

No marketplace, runtime package loader, dynamic binary, process/shell/MCP tool, TCP server, generic invoke, raw database/path/secret API, production feature extraction, or automatic commit is part of this child.
