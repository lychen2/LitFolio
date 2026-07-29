# Extract Update, Sync, and Document Integration Plugins - Design

## 1. Scope / Trigger

Extract updater, sync, and document integrations after host security/storage contracts exist. All three plugins are optional and independent; core local document behavior and accepted evidence remain complete.

## 2. Signatures

```ts
type SnapshotPreview = {
  token: string;
  sourceVersion: number;
  changes: { add: number; update: number; conflict: number };
  pluginArchives: { pluginId: string; status: "included" | "archived" }[];
};

interface LibrarySnapshotCapability {
  create(options: { includePluginExports: boolean }): Promise<OpaqueSnapshotHandle>;
  previewApply(handle: OpaqueSnapshotHandle): Promise<SnapshotPreview>;
  apply(token: string): Promise<ApplyResult>;
}
```

The host owns snapshot reads/applies and invokes registered plugin export/import hooks. `sync-integrations` receives opaque handles, never raw DB/plugin paths.

`updates` contributes `app.update` actions/settings/job renderers and receives an updater-specific network capability. It cannot call a generic transport or perform a check at core startup.

`document-services` exposes public conversion/export contributions such as:

```ts
interface DocumentConversionService {
  supports(inputKind: string, outputKind: string): boolean;
  convert(input: GrantedFileHandle, outputKind: string): Promise<GrantedFileHandle>;
  stageCandidate(input: GrantedFileHandle): Promise<StagedDocumentCandidate>;
}
```

## 3. Contracts

- Each canonical manifest declares immutable plugin ID/version/API version, activation entries, dependencies, capabilities, contributions, data/migration version, and build entries. The frontend, Rust runtime, mock, and build registries are generated from the resolved manifest plan and must agree.
- The host issues an opaque instance binding with identity, generation, and typed grants at activation. Frontend transport attaches it; backend resolves it before every operation. A caller-supplied plugin ID is descriptive only.
- Typed network grants list operations, methods, schemes, hosts, redirect policy, quotas, disclosure, consent, and revocation behavior. Typed secret grants bind opaque secret references to approved request fields in a host-owned adapter. Typed file grants are scoped opaque handles with mode, path boundary, expiry, and revocation. Raw paths and secret values never cross the plugin boundary.
- Before dispatch to a new destination or data category, the host presents and records a data-transfer disclosure with destination, data categories/content scope, credential use, and known retention. A successful manual updater check, sync refresh, or parser request records schedule eligibility only for the matching generation, endpoint policy, disclosure version, and grants; change invalidates it.
- The host writes immutable, redacted execution events for updater checks/downloads, sync transport, parser/conversion, staged candidate submission, core acceptance, cancellation, denial, and error. Plugins cannot suppress, rewrite, or delete required events.
- WebDAV credentials live in namespaced secrets; endpoints pass scheme/host/redirect policy.
- Push uploads a validated versioned snapshot; pull downloads to staging, verifies, previews, backs up, then applies by token atomically.
- Snapshot tokens bind to content hash/current library revision and expire; changed state requires new preview.
- Plugin data joins snapshots only through host export/import hooks. Absent owners remain opaque versioned archives.
- Obsidian destinations are explicit user grants; writes use temp file plus atomic replace and collision policy.
- MinerU/document services own raw parser artifacts and optional enrichment only. They stage a normalized candidate with source hash, schema version, ordered segments, pages/geometry, assets, and provenance. Core validates it and atomically accepts only an explicit approved candidate; only core writes accepted revisions, segments, canonical Markdown, and FTS.
- Conversion validates input/output kind, size, path, and content signature where possible.
- Disable revokes the generation before cleanup, rejects new work, cancels jobs, removes contributions, revokes temporary handles, and preserves config/checkpoints. Callbacks, retries, staged commits, acceptance requests, and result publication recheck generation and cancellation; stale results are discarded.
- Accepted revisions/segments, source links, immutable snapshots, backlinks, Reader navigation, keyword search, notes, and baseline Markdown export are core-owned. They remain available when `document-services` is absent or disabled.

## 4. Validation & Error Matrix

| Condition | Result |
| --- | --- |
| updates plugin absent | no updater route, command, schedule, or network call; core remains usable |
| update/sync schedule requested before manual action | reject with `manual_refresh_required` |
| destination, disclosure, grant, or generation changed | prior schedule eligibility revoked; new manual action required |
| credential missing/denied | structured config/permission error; secret redacted |
| unsafe endpoint/redirect | network policy denial |
| remote snapshot invalid/incompatible | reject before backup/apply |
| local state changed after preview | snapshot conflict; new preview required |
| apply fails | restore complete backup and report result |
| owner plugin absent | retain opaque archive in snapshot/apply report |
| external path denied/escape/symlink | `permission_denied` |
| conversion output invalid | staged output deleted; source untouched |
| candidate malformed/rejected/cancelled | staged artifacts retained or cleaned by policy; active core revision unchanged |
| disable mid-transfer/conversion | cancellation, staged cleanup, and late-result discard |
| document plugin absent | core PDFJS/Markdown, accepted evidence, Reader, search, and export still work |

## 5. Good / Base / Bad Cases

- Good: a user completes a disclosed manual sync refresh, later enables a matching schedule, and a pull downloads to staging, validates, previews, backs up, atomically applies core/available-plugin data, archives absent-plugin data, and can restore after injected failure.
- Good: document services stage parser output, core validates and explicitly accepts it, then source links/snapshots/backlinks and baseline Reader/export remain after the plugin is disabled.
- Base: `updates` and `document-services` are disabled; no updater/parser network work occurs and local PDF reading, accepted evidence, keyword search, and basic export remain available.
- Bad: an updater starts from core startup, sync recursively reads the library root, or a parser writes `library.db` or canonical Markdown directly.

## 6. Tests Required

- Canonical manifest/build/runtime/mock parity and independent enable/disable tests for `updates`, `sync-integrations`, and `document-services`.
- Existing sync security/local/WebDAV tests plus credential redaction, unsafe endpoint/redirect, data-transfer disclosure, manual-before-schedule, and updater-ownership cases.
- Snapshot hash/version/token expiry, conflict, plugin hook, absent-plugin archive, backup, atomic apply, restore, cancellation, and generation tests.
- Config migration tests for sync/Obsidian/pdf_markdown/MinerU fields, unknown fields, and secrets.
- Typed file grant/path traversal/symlink/atomic write/collision tests for Obsidian/export.
- Parser stage/validate/explicit-accept, source-hash/schema/geometry validation, rejected/cancelled/stale candidate, execution-record, and document-service-disabled evidence-survival tests.
- Core-only, update, sync, and document-service E2E.

## 7. Wrong vs Correct

Wrong:

```rust
walkdir(library_root).zip_and_upload()
```

Correct: request an opaque, versioned snapshot from the host capability and upload that handle's validated stream.

Wrong: parser output writes canonical document tables directly. Correct: stage an opaque candidate and let core validate and atomically accept an explicitly approved revision.

Wrong: updater check runs in core startup. Correct: the `updates` plugin performs an explicit user-triggered check through its typed network grant.
