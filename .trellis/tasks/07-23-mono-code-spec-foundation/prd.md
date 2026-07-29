# Establish Mono Code Specifications

## Goal

Create an executable, source-backed Trellis specification baseline for the current React/Tauri application before any Mono source refactor starts.

## Dependencies

- `.trellis/tasks/00-bootstrap-guidelines` MUST be completed and archived first.
- The completed bootstrap MUST replace all frontend `(To be filled by the team)` placeholders with current-code evidence.

## Requirements

- Review, complete, and correct the seeded `.trellis/spec/backend/` and `.trellis/spec/cross-layer/` indexes/documents for Tauri commands, storage/migrations, error handling, API contracts, plugin-capability planning boundaries, and Reader annotation planning boundaries.
- Describe current implemented behavior, repository conventions, validation commands, and real source examples. Do not present the unimplemented Mono target as an existing convention.
- Link all new documents from their layer indexes and make `get_context.py --mode packages` expose the complete spec surface.
- Record current command registration/parity, SQLx migration immutability, `LibraryPaths`, typed API/schema parsing, Tauri mocks, and test placement.
- Mark future-only plugin and Reader contracts explicitly as task-design references until their implementation is stable.
- Define the target `PluginManifestV1` once, including activation, dependency, capability, contribution, storage/migration, and frontend/Cargo build declarations; enforce contribution/migration surface coherence and a pinned compatible core API compile target; require versioned JSON conformance fixtures that later TypeScript, Rust, runtime, build, mock, and conversion consumers must share rather than restate.
- Define minimum stable target boundaries for core domain/resource references, plugin declarations versus host-issued grants, host-owned atomic quota/reservation windows and verifiable consent evidence, and persisted job owner/state/event/cancellation/terminal records. Keep these target contracts separate from current Tauri command and `ai_jobs`/`jobs` behavior.
- Record the current unconditional `startAutoUpdateCheck()` boot call and periodic timer as current-state evidence, while specifying the target `updates` integration ownership and an instrumented zero-network core boot/idle conformance contract that observes frontend primitives, lower-level WebView/process resource and navigation attempts, CSP-denied attempts, updater transport, backend adapters, and network-capable timers.
- Preserve the independent bootstrap task history and all unrelated worktree changes.

## Constraints

- This task changes Trellis specs and task context only; it does not reorganize application source.
- Examples must cite current files and must not use invented APIs.
- Guidance must be concise enough for implement/check agents to load without re-reading the whole repository.

## Out of Scope

- Implementing Mono directories, annotations, plugin APIs, or migrations.
- Treating planned Cargo features or plugin sidecar schemas as current rules.
- Rewriting application documentation unrelated to agent coding specifications.

## Acceptance Criteria

- [x] Frontend specs contain no placeholder text and remain linked from `.trellis/spec/frontend/index.md`.
- [x] Backend specs cover command registration, storage/migrations, errors, and Rust test expectations with current source anchors.
- [x] Cross-layer specs cover typed invoke/schema parity, command mocks, and current data-flow validation with current source anchors.
- [x] Future Mono contracts are clearly labeled as planning references rather than current implementation rules.
- [x] One canonical target `PluginManifestV1` and versioned fixtures cover valid manifests, activation/build/contribution/migration coherence, a pinned compatible core API compile target, actionable invalid cases, dependency/build contradictions, and expected frontend/backend/runtime/build/mock/conversion registry agreement.
- [x] Cross-language target fixtures pin `MonoCanonicalJsonV1` bytes, stable ASCII domain/resource identifiers, host grants/admission ledger/consent evidence, and plugin/job envelopes, including owner, generation where plugin-owned, monotonic event sequence, cancellation, and exactly one terminal outcome, without claiming those contracts are implemented.
- [x] Startup-network guidance names the current updater call/timer, assigns target ownership to the removable `updates` integration, and defines a cold-boot plus idle egress-observation fixture whose core-only expected count is zero across frontend, WebView/process resource/navigation/CSP, updater, backend, and scheduler boundaries.
- [x] All spec indexes and Markdown links resolve, targeted duplicate/conflict scans pass, and `get_context.py --mode packages` lists the expected layers.
- [x] No application source or unrelated dirty-worktree file is changed.

## Source Anchors

- `.trellis/spec/frontend/*.md`
- `.trellis/spec/guides/*.md`
- `src/lib/apiInvoke.ts`, `src/lib/apiSchema*.ts`, `src/lib/tauriCommandParity.test.ts`
- `src/main.tsx`, `src/lib/autoUpdate.ts`, `src/lib/autoUpdate.test.ts`
- `src/test/tauriMockCommands.ts`
- `src-tauri/src/commands/mod.rs`, `src-tauri/src/storage/paths.rs`, `src-tauri/src/startup.rs`
- `src-tauri/migrations/0001_init.sql` through `0035_paper_supplements.sql`
- `.trellis/tasks/07-23-litfolio-mono/prd.md`, `design.md`, and `implement.md` as target-only contract authority
