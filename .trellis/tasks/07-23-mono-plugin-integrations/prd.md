# Extract Update, Sync, and Document Integration Plugins

## Goal

Move updater networking, WebDAV/library sync, and optional document/export services into three scoped, independently identifiable first-party plugins: `updates`, `sync-integrations`, and `document-services`.

## Dependencies

- `mono-plugin-host-sdk` is completed and archived.
- Core library snapshot, file, secrets, network, job, export, accepted-document, and document Markdown contracts are stable.

## Requirements

- `updates` owns update check/download/install-ready state, updater settings/actions, update jobs, and every updater network request. Core has no updater startup check or updater network authority.
- `sync-integrations` owns WebDAV configuration/test/preview/push/pull, sync jobs/status, conflict handling, and sync settings contributions.
- `document-services` owns Obsidian export, MinerU-assisted extraction, optional DOCX-to-PDF/document conversion, raw parser artifacts, related settings, and export/conversion contributions.
- Core retains local PDFJS/document Markdown storage/FTS, accepted document revisions/segments/source evidence, basic Markdown/citation export, diagnostics, and offline Reader behavior.
- Each plugin has its own canonical manifest, activation entrypoints, declared contributions, data/version/migrations, and build inclusion. No plugin identity supplied by a caller authorizes an operation.
- No plugin directly reads `library.db`, another plugin directory, arbitrary external files, or secrets. Sync uses host-created opaque library snapshots and plugin export/import hooks.
- Use typed grants: network grants constrain operation, methods, schemes, hosts, redirects, quotas, disclosure, and consent; secret grants expose only host-resolved references for named request fields; file grants expose only user-approved or host-staged opaque handles. No plugin receives raw paths or secret values.
- WebDAV credentials and MinerU/provider tokens use namespaced secrets; frontend config, execution records, and logs remain redacted.
- Before every new external destination/data category is dispatched, show and persist a data-transfer disclosure identifying destination, data categories/content scope, credential use, and known retention. A successful manual check/refresh records schedule eligibility for the same plugin generation, destination policy, disclosure version, and grants; changing any of them invalidates eligibility.
- Pull/apply requires preview, conflict report, complete backup, validated snapshot, atomic apply, and rollback.
- External Obsidian/export destinations require explicit user-scoped file grants; document conversion uses staged atomic files and content validation.
- `document-services` stages parser/conversion output and submits a normalized candidate through a typed host capability. Only core validates source hash/schema/pages/geometry/assets/order and atomically accepts an explicit approved candidate into canonical revision, segment, Markdown, and FTS state.
- Host-owned, immutable, redacted execution records cover updater checks/downloads, sync network calls, parser/conversion jobs, proposal/acceptance, cancellation, denial, and failure. Plugins cannot suppress, rewrite, or delete required records.
- Network work begins only after explicit user action. Schedules may be enabled only after a successful disclosed manual check/refresh; all jobs are cancellable on disable and on generation revocation.
- Migrate legacy sync, Obsidian, and PDF Markdown/MinerU config fields without losing unknown/plugin-owned settings.
- Keep `updates`, `sync-integrations`, and `document-services` independently enableable; Library Plus discovers conversion through the public contribution API.

## Constraints

- Core startup performs no updater, sync, MinerU, Obsidian, or conversion network/file work.
- Core and plugin data snapshots must be versioned; absent plugins remain recoverable archives rather than silently omitted.
- No direct cross-plugin filesystem scan.
- Disable revokes the instance generation before cleanup. All callbacks, retries, staged commits, parser acceptance requests, and result publication recheck generation and cancellation; late results are discarded.
- Disabling or excluding `document-services` cannot remove or degrade accepted revisions/segments, source links, immutable snapshots, backlinks, baseline Reader navigation, core keyword search, user notes, or baseline Markdown export.

## Out of Scope

- A hosted LitFolio sync service, collaborative editing, or plugin marketplace.
- Replacing core PDFJS extraction with a mandatory network parser.
- Final build pruning.

## Acceptance Criteria

- [ ] Core-only build has no update/sync/Obsidian/MinerU/conversion UI, commands, jobs, or startup side effects; core document reading, source evidence, keyword search, and baseline export still work.
- [ ] `updates`, `sync-integrations`, and `document-services` each enable/disable independently through canonical manifests and contribute only declared settings/actions/jobs.
- [ ] Updater network calls are made only by the enabled `updates` plugin, never during core startup, and a schedule cannot be enabled before a successful disclosed manual update check.
- [ ] WebDAV preview/push/pull tests cover conflicts, cancellation, credential redaction, invalid snapshots, injected failure, complete restore, manual-before-schedule, and generation revocation.
- [ ] Snapshot tests include core plus available plugin export hooks and preserve archives for absent plugins without direct directory access.
- [ ] Obsidian/export and conversion tests enforce typed file grants, path traversal/symlink safety, staged writes, output validation, and data-transfer disclosure.
- [ ] Parser tests prove stage/validate/explicit-accept boundaries: `document-services` cannot write `library.db`, core FTS, or canonical document state, and rejected/cancelled/stale candidates leave the active revision intact.
- [ ] Disabling `document-services` preserves accepted documents, segments, source links/snapshots/backlinks, Reader navigation, user notes, keyword search, and baseline Markdown export.
- [ ] Typed network/secret/file grants, host-owned redacted execution records, cancellation/generation checks, and structured disabled/denied errors are enforced.
- [ ] Legacy config migrates idempotently while preserving secrets and unknown fields for later owners.
- [ ] Lifecycle/security/frontend/backend tests, typecheck, lint, Vitest, Cargo, and integration E2E pass.

## Source Anchors

- `src/pages/settings/SyncPanel.tsx`, `ObsidianSettings.tsx`, `src/lib/syncApi.ts`, `syncSecurity.ts`
- `src-tauri/src/commands/sync.rs`, `src-tauri/src/library_sync/`
- `src-tauri/src/mineru.rs`, `src-tauri/src/commands/export.rs`, `commands/supplements.rs`
- `src-tauri/src/ai/profile.rs` mixed `pdf_markdown`/`obsidian` config
- `src-tauri/src/storage/paths.rs`, `src-tauri/src/secret.rs`
- `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`
