# NeuInk Architecture Audit for LitFolio Mono

## Audit Basis

- NeuInk source: fixed checkout `/tmp/litfolio-neuink-audit` at commit `11b848e0cfe9100a0386bcf2d4f3b839148d3b99`.
- LitFolio source: the current shared worktree. It contains unrelated user changes and was treated as read-only for this audit.
- Target contracts: `.trellis/tasks/07-23-litfolio-mono/prd.md`, `design.md`, and `implement.md`.
- Scope: crate boundaries, frontend module boundaries, workspace persistence, domain types, IPC, jobs, failure handling, test strategy, and exact core/plugin placement.

## Executive Decision

NeuInk is useful as a source of **low-level layering patterns**, not as a plugin architecture to transplant. Its Rust graph has a good dependency spine: a Tauri shell depends on an IPC adapter, which depends on domain, workspace, parser, search, config, and jobs crates. Its domain crate is Tauri-free, its search implementation has useful traits and a feature-gated embedding dependency, and its file writes use temporary files plus replacement. Those patterns can sharpen LitFolio's Mono boundaries.

NeuInk does **not** implement the lifecycle, authority, or ownership model required by LitFolio's plugin plan. One `neuink-ipc` crate depends on every subsystem and registers every command in one static handler; the frontend is one application importing feature implementations directly; jobs and caches are process-global; IPC errors are strings; callers pass raw workspace paths; and optional search work begins at startup. Copying those patterns would preserve the exact static coupling the Mono plan is intended to remove.

The recommended integration direction is therefore:

| Decision | NeuInk pattern | LitFolio action |
| --- | --- | --- |
| Adopt | Leaf domain crate with typed IDs and tagged value types | Add a small Tauri/SQLx-free core domain crate; keep plugin manifest/capability types in a separate plugin API crate |
| Adopt with limits | Central path layout and atomic replacement for files | Extend `LibraryPaths` and use atomic replacement for core file artifacts and conversion staging; retain SQLite transactions as the authority for relational state |
| Adopt with limits | Search/provider traits and Cargo feature propagation | Keep keyword search core; place embeddings, vectors, semantic/hybrid search, and their native dependency in `library-ask` |
| Adapt | Typed job vocabulary and frontend job event stream | Keep LitFolio's persisted jobs, add owner/cancellation semantics, and make plugin disable drain owned work |
| Reject | Global IPC crate/registry, global singletons, direct `invoke`, raw path arguments, string errors, startup workers | Use host-composed feature-gated command slices, attributed capability calls, structured errors, managed state, and explicit user/scheduled activation |

This conclusion supports the existing Mono contracts rather than changing them: the target already requires a typed SDK, transactional activation, fixed slots/capabilities, sidecar plugin databases, cancellation on disable, and separate build-time pruning [`.trellis/tasks/07-23-litfolio-mono/design.md:157-245`](../../07-23-litfolio-mono/design.md) and [`.trellis/tasks/07-23-litfolio-mono/design.md:272-285`](../../07-23-litfolio-mono/design.md).

## 1. Rust Crate Boundaries

### What NeuInk Actually Does

NeuInk has seven workspace crates plus the desktop Tauri crate. The workspace manifest cleanly exposes the intended physical units: config, domain, IPC, jobs, parser, search, and workspace persistence [`/tmp/litfolio-neuink-audit/Cargo.toml:1-12`](/tmp/litfolio-neuink-audit/Cargo.toml). The desktop crate depends only on `neuink-ipc` and Tauri concerns, while forwarding the `local-embedding` feature [`/tmp/litfolio-neuink-audit/apps/desktop/src-tauri/Cargo.toml:15-25`](/tmp/litfolio-neuink-audit/apps/desktop/src-tauri/Cargo.toml).

The useful part is the lower dependency direction:

```text
neuink-domain
  <- neuink-workspace
  <- neuink-search
  <- neuink-parser
  <- neuink-ipc
  <- desktop Tauri shell
```

`neuink-domain` depends only on general-purpose serialization/time/ID/error libraries, not Tauri, filesystem, network, or a database [`/tmp/litfolio-neuink-audit/crates/neuink-domain/Cargo.toml:8-13`](/tmp/litfolio-neuink-audit/crates/neuink-domain/Cargo.toml). `neuink-search` makes `fastembed` optional and contains the feature locally [`/tmp/litfolio-neuink-audit/crates/neuink-search/Cargo.toml:8-18`](/tmp/litfolio-neuink-audit/crates/neuink-search/Cargo.toml). These are real compile-time boundaries.

The weak point is `neuink-ipc`: it depends on every other NeuInk crate, Tauri, network, Tokio, and ZIP processing [`/tmp/litfolio-neuink-audit/crates/neuink-ipc/Cargo.toml:8-28`](/tmp/litfolio-neuink-audit/crates/neuink-ipc/Cargo.toml). It is therefore an application service monolith named as an adapter. Large domain workflows have accumulated there, including 1,000+ line entry/assistant/search/translation command modules. The desktop shell then starts a search worker by reaching into an IPC command module before registering the entire IPC crate [`/tmp/litfolio-neuink-audit/apps/desktop/src-tauri/src/lib.rs:5-18`](/tmp/litfolio-neuink-audit/apps/desktop/src-tauri/src/lib.rs). This is not a plugin boundary.

### Pattern to Adopt

Create only boundaries that enforce authority or optional dependency removal:

| Proposed Rust owner | Contents | Dependency rule |
| --- | --- | --- |
| `crates/litfolio-domain` | `PaperId`, `AnnotationId`, `PdfRect`, `ReaderAnnotation`, paper metadata value types, stable core error codes | No Tauri, SQLx, network, keyring, parser, plugin implementation, or UI concepts |
| `crates/litfolio-plugin-api` | `PluginId`, manifest/capability/contribution declarations, compatibility ranges, plugin lifecycle/error envelopes, attributed job/event contracts | May depend on stable domain value types; no host implementation or first-party plugin |
| `crates/litfolio-jobs` | Core scheduler state machine, `JobOwner`, cancellation handles, event envelope, shutdown/drain rules | Depends on domain/plugin API contracts; persistence is injected by the Tauri host |
| `src-tauri` core modules | Existing core repositories, `LibraryPaths`, import/Reader/AI Reading services, Tauri adapters, capability implementations, host composition | May implement plugin API interfaces; must not import first-party plugin code except through feature-gated composition modules |
| `crates/litfolio-plugin-*` | Native first-party plugin implementations and exclusive dependencies | Each crate is optional; depends only on plugin API plus granted service interfaces, never raw `AppState` or core repository implementations |

Do not split every current Rust module into a crate immediately. LitFolio already has a 22K-line backend with established repository modules and migration behavior; the first valuable physical splits are stable domain contracts, plugin API contracts, job lifecycle, and native dependencies whose absence must be proven. The Mono plan correctly sequences boundaries before extraction and build pruning [`.trellis/tasks/07-23-litfolio-mono/implement.md:45-80`](../../07-23-litfolio-mono/implement.md).

### Pattern Not to Adopt

Do not create a `litfolio-ipc` crate that depends on core and all plugins. NeuInk's single registration function enumerates workspace, entries, annotations, jobs, Reader, settings, assistant, conversations, embeddings, search, tags, and translation in one compile-time list [`/tmp/litfolio-neuink-audit/crates/neuink-ipc/src/lib.rs:3-107`](/tmp/litfolio-neuink-audit/crates/neuink-ipc/src/lib.rs). LitFolio already has the analogous chained `generate_handler!` surface and identifies it as migration source, not target [`.trellis/tasks/07-23-litfolio-mono/design.md:3-8`](../../07-23-litfolio-mono/design.md).

Instead, the Tauri composition root should concatenate feature-gated command slices at build time. Runtime disable cannot unregister generated commands, so every plugin-attributed command must also check enabled state and permission before delegating. This directly follows the existing build/runtime distinction [`.trellis/tasks/07-23-litfolio-mono/design.md:272-285`](../../07-23-litfolio-mono/design.md).

## 2. Frontend Module Boundaries

### What NeuInk Actually Does

NeuInk organizes React files under `app`, `modules`, and `shared`, with modules for annotations, assistant, library, notes, Reader, search, and settings. This improves discoverability, but the modules are not independent ownership units:

- `App.tsx` directly imports concrete assistant, notes, library, Reader, and search implementations and shared IPC clients [`/tmp/litfolio-neuink-audit/apps/desktop/src/app/App.tsx:49-116`](/tmp/litfolio-neuink-audit/apps/desktop/src/app/App.tsx).
- Annotation UI imports library utilities and Reader components rather than stable contracts [`/tmp/litfolio-neuink-audit/apps/desktop/src/modules/annotations/components/AnnotationLibraryView.tsx:17-37`](/tmp/litfolio-neuink-audit/apps/desktop/src/modules/annotations/components/AnnotationLibraryView.tsx).
- Reader UI imports library, annotations, notes, assistant, and a broad workspace API directly [`/tmp/litfolio-neuink-audit/apps/desktop/src/modules/reader/components/MineruPdfReader.tsx:5-33`](/tmp/litfolio-neuink-audit/apps/desktop/src/modules/reader/components/MineruPdfReader.tsx).
- Assistant UI imports `LibraryEntry` from a concrete library component and calls the shared assistant API directly [`/tmp/litfolio-neuink-audit/apps/desktop/src/modules/assistant/components/AssistantPanel.tsx:18-57`](/tmp/litfolio-neuink-audit/apps/desktop/src/modules/assistant/components/AssistantPanel.tsx).
- The two shared IPC files are broad application APIs. `workspaceApi.ts` mixes workspace selection, entries, tags, trash, PDF, translation, jobs, search, and more; representative direct invocations are visible at [`/tmp/litfolio-neuink-audit/apps/desktop/src/shared/ipc/workspaceApi.ts:180-269`](/tmp/litfolio-neuink-audit/apps/desktop/src/shared/ipc/workspaceApi.ts) and [`/tmp/litfolio-neuink-audit/apps/desktop/src/shared/ipc/workspaceApi.ts:817-905`](/tmp/litfolio-neuink-audit/apps/desktop/src/shared/ipc/workspaceApi.ts).

The result is a feature-folder convention with compile-time cross-feature coupling. There is no manifest registry, contribution slot, capability object, disposer, enable state, or import rule. Vite only installs React, Tailwind, and a PDF asset plugin; it has no plugin inclusion manifest [`/tmp/litfolio-neuink-audit/apps/desktop/vite.config.ts:1-24`](/tmp/litfolio-neuink-audit/apps/desktop/vite.config.ts).

### Exact LitFolio Placement

Keep the parent design's frontend topology; NeuInk does not justify changing it:

| Path | Exact owner | May import |
| --- | --- | --- |
| `src/app/` | Boot, providers, shell, route/slot hosts, plugin activation coordinator | `core`, core `features`, `plugin-sdk`; feature-gated plugin entry registry only |
| `src/core/domain/` | Stable frontend value types and discriminated unions mirroring IPC schemas | Core only |
| `src/core/data/` | Narrow validated clients: papers, local import, Reader, annotations, AI Reading, core jobs | Core schemas and transport adapter; no plugin command names |
| `src/core/controllers/` | Reader save queues, query/mutation ordering, job observation, local workflow state | Core data/domain only |
| `src/features/` | Core Library, local Import, Reader, and Settings presentation | Core controllers plus plugin slot types, never plugin implementations |
| `src/plugin-sdk/` | Public manifest, capability, slot, event, error, lifecycle, and test contracts | Stable value types only |
| `src/plugins/<plugin-id>/` | First-party plugin UI, activation entry, scoped client adapter, tests | `plugin-sdk` and granted capability interfaces; no `src/core/data` repository implementation imports |

This placement is materially stronger than NeuInk's modules because ownership is enforced at the import boundary. LitFolio should add ESLint/import tests before moving features. Existing direct static routes and navigation remain evidence of the current problem: all pages are imported into `App.tsx` [`src/App.tsx:13-42`](../../../../src/App.tsx), and all optional navigation entries are loaded into one registry [`src/lib/navigationRegistry.ts:30-49`](../../../../src/lib/navigationRegistry.ts).

### Pattern to Adopt

NeuInk's feature-local tests and local controller/helper files are worth retaining as a style inside each LitFolio owner. Its Reader and assistant modules colocate many focused unit tests with state reducers, scope builders, dirty registries, and rendering helpers. Adopt this locality after the ownership boundaries exist; do not treat directory names alone as architecture.

## 3. Workspace Persistence

### Useful NeuInk Patterns

NeuInk represents a workspace with a marker file and a central layout object. `WorkspaceLayout` owns paths for entries, trash, conversations, cache, PDFs, segments, annotations, translations, notes, assets, and parser output [`/tmp/litfolio-neuink-audit/crates/neuink-workspace/src/layout.rs:5-113`](/tmp/litfolio-neuink-audit/crates/neuink-workspace/src/layout.rs). `open_existing` distinguishes missing path, non-directory, missing marker, invalid JSON, and unsupported schema version before use [`/tmp/litfolio-neuink-audit/crates/neuink-workspace/src/workspace.rs:52-78`](/tmp/litfolio-neuink-audit/crates/neuink-workspace/src/workspace.rs).

Its file writer serializes first, writes a unique temporary file, calls `sync_all`, and renames it into place; the replacement fallback preserves and restores a backup on failure [`/tmp/litfolio-neuink-audit/crates/neuink-workspace/src/atomic_write.rs:12-69`](/tmp/litfolio-neuink-audit/crates/neuink-workspace/src/atomic_write.rs). This is a concrete improvement for LitFolio's Markdown, translated document, conversion report, archive manifest, and staged configuration writes.

### Limits and Rejection

NeuInk's folder-of-JSON model should not replace LitFolio's SQLite core or per-plugin SQLite sidecars. Atomicity is only per file. Multi-file operations can leave partial state: note creation writes the note and then entry metadata in two independent replacements [`/tmp/litfolio-neuink-audit/crates/neuink-workspace/src/workspace.rs:164-191`](/tmp/litfolio-neuink-audit/crates/neuink-workspace/src/workspace.rs), while note update writes Markdown and then metadata separately [`/tmp/litfolio-neuink-audit/crates/neuink-workspace/src/note.rs:55-97`](/tmp/litfolio-neuink-audit/crates/neuink-workspace/src/note.rs). There is no transaction spanning those files, no durable stage record, and no injected-failure recovery protocol.

LitFolio already centralizes canonical core paths in `LibraryPaths`, including `library.db`, papers, notes, vectors, attachments, backups, logs, and config [`src-tauri/src/storage/paths.rs:38-75`](../../../../src-tauri/src/storage/paths.rs). Extend that object with:

```text
plugins/<plugin-id>/data.db
plugins/<plugin-id>/files/
archives/plugins/<plugin-id>/<archive-version>/
conversion/<conversion-id>/{stage.json,report.json,staging/}
```

The exact persistence rule remains:

| Data | Owner and location |
| --- | --- |
| Papers, folders, tags, local metadata, PDF files, extracted/translated core document Markdown, `ReaderAnnotation`, core FTS, AI Reading outputs, core job records | Core: `library.db` and canonical core directories |
| Plugin records and plugin-specific caches/results | `plugins/<plugin-id>/data.db` plus its scoped files directory |
| Cross-owner reference | Stable core ID copied into plugin storage; no plugin foreign key into `library.db` |
| Host lifecycle metadata | Core host registry; plugin-specific job payload/result remains in the plugin sidecar |
| Legacy conversion | Staging + durable marker + full backup + verified atomic promotion + automatic restore, as already specified in the Mono design [`.trellis/tasks/07-23-litfolio-mono/design.md:247-270`](../../07-23-litfolio-mono/design.md) |

Do not expose a root `PathBuf` to plugins as NeuInk does in command requests, for example [`/tmp/litfolio-neuink-audit/crates/neuink-ipc/src/commands/annotation.rs:9-25`](/tmp/litfolio-neuink-audit/crates/neuink-ipc/src/commands/annotation.rs). A plugin receives a storage capability bound to its ID and an opaque core data capability; the host resolves paths.

## 4. Domain Types

### Patterns Worth Adopting

NeuInk's ID macro creates distinct serializable newtypes for entries, notes, segments, annotations, tags, links, and conversations [`/tmp/litfolio-neuink-audit/crates/neuink-domain/src/ids.rs:5-52`](/tmp/litfolio-neuink-audit/crates/neuink-domain/src/ids.rs). This prevents accidental ID interchange inside Rust while preserving string IPC representation. LitFolio should use the same concept for stable core IDs and `PluginId`, with validation on construction rather than a public unchecked string constructor.

NeuInk also uses Serde-tagged enums for true variants, such as `ContentItem` [`/tmp/litfolio-neuink-audit/crates/neuink-domain/src/entry.rs:53-57`](/tmp/litfolio-neuink-audit/crates/neuink-domain/src/entry.rs) and source-link ownership [`/tmp/litfolio-neuink-audit/crates/neuink-domain/src/source_link.rs:35-54`](/tmp/litfolio-neuink-audit/crates/neuink-domain/src/source_link.rs). Domain validation is located with the value type rather than only in UI code; `EntryMeta::validate` enforces title invariants [`/tmp/litfolio-neuink-audit/crates/neuink-domain/src/entry.rs:21-50`](/tmp/litfolio-neuink-audit/crates/neuink-domain/src/entry.rs).

### Patterns Not to Adopt

NeuInk's annotation model is not suitable for Mono. `Annotation.kind` is an arbitrary string, text selection is optional, and the model has neither a discriminated highlight/text-note union nor revision-based mutation control [`/tmp/litfolio-neuink-audit/crates/neuink-domain/src/annotation.rs:6-19`](/tmp/litfolio-neuink-audit/crates/neuink-domain/src/annotation.rs) and [`/tmp/litfolio-neuink-audit/crates/neuink-domain/src/annotation.rs:82-89`](/tmp/litfolio-neuink-audit/crates/neuink-domain/src/annotation.rs). Keep the parent contract `PdfHighlight | PdfTextNote`, normalized page-space geometry, revision, timestamps, and stale-write errors [`.trellis/tasks/07-23-litfolio-mono/design.md:68-142`](../../07-23-litfolio-mono/design.md).

Parser-specific data must also not leak into core domain types. NeuInk's `SourceSegment` embeds `mineru_metadata`, raw parser type, subtype, and parser grouping fields [`/tmp/litfolio-neuink-audit/crates/neuink-domain/src/segment.rs:7-28`](/tmp/litfolio-neuink-audit/crates/neuink-domain/src/segment.rs). For LitFolio:

- Core owns a parser-neutral `DocumentBlock`/`DocumentArtifact` contract only if Reader/search needs it.
- `document-services` owns MinerU task IDs, raw response fields, service metadata, ZIP layout, and provider-specific retry state.
- The plugin converts successful output into core Markdown/PDF-text ingestion through a granted capability.
- Provider-specific provenance remains in the plugin sidecar or an opaque namespaced metadata field, not in `litfolio-domain`.

Frontend DTOs should not be maintained as unchecked hand copies. NeuInk's Rust IDs are newtypes, but frontend IDs are all aliases of `string`, and the annotation/entry structures are duplicated manually [`/tmp/litfolio-neuink-audit/apps/desktop/src/shared/types/domain.ts:1-15`](/tmp/litfolio-neuink-audit/apps/desktop/src/shared/types/domain.ts) and [`/tmp/litfolio-neuink-audit/apps/desktop/src/shared/types/domain.ts:131-162`](/tmp/litfolio-neuink-audit/apps/desktop/src/shared/types/domain.ts). LitFolio's existing response parsers are stronger: they reject missing or incorrectly typed fields [`src/lib/apiSchemaCore.ts:3-41`](../../../../src/lib/apiSchemaCore.ts). Preserve runtime parsing and split schemas by owner.

## 5. IPC and Capability Boundary

### Useful NeuInk Pattern

NeuInk command functions generally define explicit request/response structs and delegate storage work to `Workspace`. This is preferable to accepting arbitrary JSON deep in domain code. The Tauri shell itself is also small and leaves command registration to another unit [`/tmp/litfolio-neuink-audit/apps/desktop/src-tauri/src/lib.rs:1-22`](/tmp/litfolio-neuink-audit/apps/desktop/src-tauri/src/lib.rs).

### Why the Overall IPC Design Is Not Reusable

The adapter flattens typed internal failures to `String`. `WorkspaceError` has meaningful variants, including missing data, revision conflicts, invalid transitions, and unsupported schema versions [`/tmp/litfolio-neuink-audit/crates/neuink-workspace/src/error.rs:5-57`](/tmp/litfolio-neuink-audit/crates/neuink-workspace/src/error.rs), but commands erase them with `error.to_string()` [`/tmp/litfolio-neuink-audit/crates/neuink-ipc/src/commands/workspace.rs:88-123`](/tmp/litfolio-neuink-audit/crates/neuink-ipc/src/commands/workspace.rs). The frontend then calls `invoke<T>` with a compile-time assertion only; no parser validates the runtime response in representative entry operations [`/tmp/litfolio-neuink-audit/apps/desktop/src/shared/ipc/workspaceApi.ts:222-269`](/tmp/litfolio-neuink-audit/apps/desktop/src/shared/ipc/workspaceApi.ts).

NeuInk also enables `tauri-plugin-http` globally in the shell [`/tmp/litfolio-neuink-audit/apps/desktop/src-tauri/src/lib.rs:5-8`](/tmp/litfolio-neuink-audit/apps/desktop/src-tauri/src/lib.rs). LitFolio plugins must not receive unrestricted frontend HTTP access because it bypasses host network scopes, attribution, logging, and disable guards.

### Exact LitFolio IPC Shape

```text
React plugin
  -> granted typed capability client
  -> one host transport adapter
  -> build-included Tauri command with PluginCallContext
  -> enabled/permission/argument validation
  -> scoped capability implementation
  -> core service or plugin service
```

Every result should use a serializable envelope such as:

```rust
struct IpcError {
    code: ErrorCode,
    message: String,
    owner: Option<PluginId>,
    retryable: bool,
    details: Option<serde_json::Value>,
}
```

Core errors include stable annotation/AI/storage/job codes. Plugin lifecycle errors retain the codes already defined by the design: disabled, denied, incompatible, missing dependency, and activation failed [`.trellis/tasks/07-23-litfolio-mono/design.md:207-234`](../../07-23-litfolio-mono/design.md). The frontend parses both success and error envelopes before exposing them to controllers.

Keep and extend LitFolio's command parity test, which scans frontend invocation strings and compares them with the Rust registry [`src/lib/tauriCommandParity.test.ts:26-101`](../../../../src/lib/tauriCommandParity.test.ts). Add owner-aware parity: each plugin invocation must appear in its manifest command/capability declaration, be absent from a core-only registry, and be rejected while disabled.

## 6. Jobs and Background Work

### Useful NeuInk Vocabulary

NeuInk defines explicit job kind, queued/processing/succeeded/failed/canceled states, progress, entry/workspace scope, event kind, payload, and timestamps [`/tmp/litfolio-neuink-audit/crates/neuink-job/src/lib.rs:11-113`](/tmp/litfolio-neuink-audit/crates/neuink-job/src/lib.rs). A frontend hook loads current jobs, subscribes to an event channel, filters by workspace root, and unregisters its listener on cleanup [`/tmp/litfolio-neuink-audit/apps/desktop/src/shared/hooks/useWorkspaceJobs.ts:10-47`](/tmp/litfolio-neuink-audit/apps/desktop/src/shared/hooks/useWorkspaceJobs.ts). These are useful user-facing semantics.

### Runtime Weaknesses

NeuInk's manager is process-local behind `OnceLock<LocalJobManager>` [`/tmp/litfolio-neuink-audit/crates/neuink-ipc/src/commands/job.rs:1-15`](/tmp/litfolio-neuink-audit/crates/neuink-ipc/src/commands/job.rs). Job state and events live in an in-memory `HashMap`/`Vec`, capped by eviction [`/tmp/litfolio-neuink-audit/crates/neuink-job/src/lib.rs:214-284`](/tmp/litfolio-neuink-audit/crates/neuink-job/src/lib.rs). Cancellation mutates status only; there is no execution handle or token tied to `cancel` [`/tmp/litfolio-neuink-audit/crates/neuink-job/src/lib.rs:167-187`](/tmp/litfolio-neuink-audit/crates/neuink-job/src/lib.rs). Lock poisoning causes empty lists or absent updates rather than a surfaced failure [`/tmp/litfolio-neuink-audit/crates/neuink-job/src/lib.rs:189-234`](/tmp/litfolio-neuink-audit/crates/neuink-job/src/lib.rs). Tauri event emission errors are ignored [`/tmp/litfolio-neuink-audit/crates/neuink-ipc/src/commands/job.rs:13-15`](/tmp/litfolio-neuink-audit/crates/neuink-ipc/src/commands/job.rs).

LitFolio already has the stronger persistence base: its `JobRepo` stores status, progress, errors, attempts, and lifecycle timestamps in SQLite [`src-tauri/src/storage/jobs.rs:10-84`](../../../../src-tauri/src/storage/jobs.rs), including validated transition/retry behavior [`src-tauri/src/storage/jobs.rs:116-224`](../../../../src-tauri/src/storage/jobs.rs). Do not replace it with NeuInk's in-memory manager.

### Required Core Job Contract

The job engine belongs to core/host because plugin disable and the shared job UI depend on it. Add these fields and behaviors:

| Requirement | Placement |
| --- | --- |
| `owner: Core | Plugin(PluginId)` and stable job type | Core job envelope and persisted host registry |
| Cooperative cancellation token linked to the actual task | Core scheduler; token passed through the scoped `jobs` capability |
| `accepting_work` gate checked before queue/start | Plugin lifecycle state in host |
| Plugin-specific payload, checkpoint, and result | Plugin sidecar; host stores only lifecycle envelope and opaque reference |
| Disable drain | Stop accepts -> cancel owner jobs -> await bounded drain -> mark interrupted/failed if needed -> continue lifecycle cleanup |

Core import/index/export/AI Reading jobs use `Core` ownership. Plugin jobs use their plugin ID and cannot survive disable. Restart recovery must convert orphaned `running` records to an explicit interrupted/recoverable state before retry; merely retaining `running` is misleading.

Do not copy NeuInk's startup behavior. It marks search build state and starts warmup/cleanup threads during Tauri setup [`/tmp/litfolio-neuink-audit/crates/neuink-ipc/src/commands/search.rs:145-168`](/tmp/litfolio-neuink-audit/crates/neuink-ipc/src/commands/search.rs). That conflicts with Mono's offline/no-network startup rule and plugin scheduled-work declaration. Core may initialize cheap local metadata; optional embeddings/search work starts only after explicit use or an enabled plugin's declared schedule.

## 7. Failure Handling and Security

### Adopt

- Preserve typed errors within every Rust layer. NeuInk's `WorkspaceError` is a useful example before it is flattened at IPC [`/tmp/litfolio-neuink-audit/crates/neuink-workspace/src/error.rs:5-57`](/tmp/litfolio-neuink-audit/crates/neuink-workspace/src/error.rs).
- Validate state transitions in the owner. NeuInk rejects invalid PDF parse transitions before persistence [`/tmp/litfolio-neuink-audit/crates/neuink-workspace/src/workspace.rs:324-369`](/tmp/litfolio-neuink-audit/crates/neuink-workspace/src/workspace.rs).
- Preflight multi-target mutations before writes. NeuInk tests that an invalid batch tag target leaves no new tag or partial attachment [`/tmp/litfolio-neuink-audit/crates/neuink-ipc/src/commands/tag_tests.rs:102-121`](/tmp/litfolio-neuink-audit/crates/neuink-ipc/src/commands/tag_tests.rs).
- Use atomic file replacement for individual file artifacts, while using database transactions or staged protocols for multi-resource operations.

### Do Not Adopt

- Do not flatten all errors to strings. Controllers need stable codes for retry, conflict, missing profile, disabled plugin, and permission denial.
- Do not swallow lock, thread-spawn, or event-emission failures. A cleanup worker may log and degrade, but activation/mutation/event delivery required for correctness must fail observably.
- Do not store API keys in ordinary serialized config. NeuInk's settings types contain `api_key` fields [`/tmp/litfolio-neuink-audit/crates/neuink-config/src/lib.rs:68-99`](/tmp/litfolio-neuink-audit/crates/neuink-config/src/lib.rs), and settings responses include whole profiles [`/tmp/litfolio-neuink-audit/crates/neuink-ipc/src/commands/settings.rs:46-61`](/tmp/litfolio-neuink-audit/crates/neuink-ipc/src/commands/settings.rs). LitFolio must keep backend keyring resolution and return only secret references/redacted state.
- Do not expose arbitrary workspace paths or Tauri commands to plugins. Scoped services must enforce path, network host, secret namespace, and enabled-state authority.
- Do not let plugin activation publish partial contributions. Keep the planned transactional activation and reverse-order rollback [`.trellis/tasks/07-23-litfolio-mono/design.md:182-205`](../../07-23-litfolio-mono/design.md).

## 8. Test Strategy

### NeuInk Strengths to Reuse

NeuInk has focused tests at several useful layers:

| Layer | Evidence | Reusable practice |
| --- | --- | --- |
| Domain | Entry invariants tested beside the type [`/tmp/litfolio-neuink-audit/crates/neuink-domain/src/entry.rs:59-81`](/tmp/litfolio-neuink-audit/crates/neuink-domain/src/entry.rs) | Keep pure invariant tests fast and exhaustive |
| Persistence | Temp-directory workspace tests cover create/update/delete/restore/import [`/tmp/litfolio-neuink-audit/crates/neuink-workspace/src/workspace_tests.rs:10-155`](/tmp/litfolio-neuink-audit/crates/neuink-workspace/src/workspace_tests.rs) | Test the public persistence service against real files/SQLite, not only mocks |
| Search ingestion | Workspace tests assert which note, annotation, and parsed records enter search [`/tmp/litfolio-neuink-audit/crates/neuink-workspace/src/workspace_tests.rs:889-909`](/tmp/litfolio-neuink-audit/crates/neuink-workspace/src/workspace_tests.rs) | Test ownership/filter semantics at indexing boundaries |
| Parser | Dedicated regression fixture module is compiled with the parser crate [`/tmp/litfolio-neuink-audit/crates/neuink-parser/src/lib.rs:1-12`](/tmp/litfolio-neuink-audit/crates/neuink-parser/src/lib.rs) | Keep external-format regressions with the owning plugin |
| Frontend | Vitest is an explicit frontend script [`/tmp/litfolio-neuink-audit/apps/desktop/package.json:6-14`](/tmp/litfolio-neuink-audit/apps/desktop/package.json) | Keep controller/reducer/rendering tests feature-local |

### Gaps LitFolio Must Not Inherit

NeuInk's top-level test command is Cargo workspace testing, while frontend tests are a separate desktop script [`/tmp/litfolio-neuink-audit/package.json:10-17`](/tmp/litfolio-neuink-audit/package.json). The audited tree has no plugin matrix because it has no plugin system. Its architecture does not supply command parity, import-boundary, enable/disable lifecycle, disposer, sidecar migration, permission denial, contribution rollback, core-only artifact, or end-to-end core workflow evidence.

LitFolio's minimum architecture test matrix should be:

| Test suite | Required assertion |
| --- | --- |
| Dependency/import | Core cannot import plugin implementations; plugins cannot import raw core repositories; plugin-to-plugin imports are rejected |
| Registry/build | Frontend manifest, Rust command slice, Cargo feature, Vite entry, and mocks agree; core-only artifacts exclude plugin chunks and exclusive native dependencies |
| Lifecycle/failure | Incompatible/denied/failed activation publishes nothing; disable removes every contribution/listener, rejects new calls, cancels/drains jobs, closes sidecar, and retains data |
| Persistence/conversion | Every sidecar migration is independent; historical fixtures back up, stage, verify, survive injected failures, restore, and rerun idempotently |
| Product flow | Core-only offline import -> search -> Reader -> annotation -> export works without AI; each plugin passes include/enable/disable/restart tests independently |

The existing Mono execution plan already names these gates and should remain authoritative [`.trellis/tasks/07-23-litfolio-mono/implement.md:45-85`](../../07-23-litfolio-mono/implement.md). NeuInk adds useful examples for leaf tests, but no reason to weaken that matrix.

## 9. Exact Core-vs-Plugin Placement

The following is the final placement recommendation, including areas suggested by NeuInk's code:

| Capability/data | Core or plugin | Exact placement and boundary |
| --- | --- | --- |
| Paper IDs/metadata, folders, tags, local PDF/BibTeX import, keyword search, basic export, diagnostics | Core | `litfolio-domain`, core repositories/services, `src/core/data`, core Library/Import UI |
| PDF rendering, page geometry, `PdfHighlight`, `PdfTextNote`, annotation mutation/search | Core | Reader domain/data/controller/components; `pdf_notes` in `library.db`; no generic string annotation kind |
| TL;DR, Quick Read, translation, terminology, current-paper/selection questions, profile references | Core AI Reading | Backend resolves keyring secret; user-triggered calls only; bounded Reader context; no full-library embeddings dependency |
| Job scheduler, owner envelope, cancellation, events, job UI slot | Core host | `litfolio-jobs` plus persisted core registry; plugin payload/checkpoint in owner sidecar |
| DOI, arXiv, remote metadata/search, remote PDF acquisition | `source-connectors` | Plugin crate/UI; network capability scoped to declared hosts; imported result crosses a typed paper-import capability |
| RSS, Browse, Topic discovery, candidates, alerts | `discovery-feeds` | Plugin sidecar, routes/navigation/settings/jobs contributions; `feed-rs` feature-gated with plugin |
| Embeddings, vectors, semantic/hybrid full-library search, Ask sessions/global assistant | `library-ask` | Adapt NeuInk search traits here; `fastembed`/vector implementation excluded from core; core exposes narrow paper/document read capability |
| Projects, evidence, comparisons, literature review, writing, broad agent proposals | `research-workbench` | Sidecar-owned workflow state and routes; uses granted paper/annotation/AI capabilities |
| Paper links, concepts, citation/similarity graph | `knowledge-graph` | Sidecar-owned graph data and UI; graph renderer/native/network dependencies feature-gated |
| Queue, smart collections, custom fields, duplicate tools, supplements | `library-plus` | Sidecar-owned optional state; Library toolbar/row/detail/filter contributions |
| WebDAV and library synchronization | `sync-integrations` | Plugin state/secrets, scoped files/network/jobs; no raw `library.db` handle |
| MinerU, custom parser endpoints, Obsidian/document conversion | `document-services` | Parser/provider internals and raw outputs in plugin; successful parser-neutral Markdown/artifact imported through core capability |
| Theme, language, core profile selection, plugin manager | Core Settings host | Optional settings panels register through `settings.sections`; secret values never returned |
| Generic skills, MCP servers, subagents, workspace-global tool execution | Not core AI Reading | Place with the plugin that owns the workflow, initially `research-workbench` or `library-ask`; network/files/tools remain separately scoped capabilities |

NeuInk's package split maps only partially onto this ownership:

| NeuInk unit | LitFolio treatment |
| --- | --- |
| `neuink-domain` | Adopt the leaf-crate idea, but narrow it to stable core/plugin API values and replace the annotation/string/provider leakage |
| `neuink-workspace` | Adapt path validation and atomic file writes into core storage; do not adopt file-per-record persistence or raw-root access |
| `neuink-search` | Split: keyword/search interfaces needed by core stay core; embedding/vector implementations belong to `library-ask` |
| `neuink-parser` | Entirely `document-services`, except a parser-neutral result contract |
| `neuink-job` | Adapt vocabulary into core's persisted, owner-aware, cancellable scheduler |
| `neuink-config` | Split core settings from plugin settings; secrets remain keyring-backed and scoped |
| `neuink-ipc` | Do not replicate; replace with core transport adapter plus feature-gated, attributed plugin command slices |

## 10. Concrete Planning Impact

No parent product requirement needs to change. The audit strengthens four implementation details that child plans should make explicit:

1. `mono-core-boundaries` should establish the minimum Rust leaf crates (`domain`, `plugin-api`, and jobs contract), not only frontend folders and API modules.
2. `mono-plugin-host-sdk` should make jobs owner-aware and cancellable, and should treat raw path, arbitrary invoke, global HTTP, and secret enumeration as denied by construction.
3. `mono-plugin-library-ask` can use NeuInk's `SearchIndex`, `EmbeddingProvider`, and `VectorStore` separation as a design reference; NeuInk exposes these traits at [`/tmp/litfolio-neuink-audit/crates/neuink-search/src/lib.rs:13-31`](/tmp/litfolio-neuink-audit/crates/neuink-search/src/lib.rs), with the core `SearchIndex` surface remaining small [`/tmp/litfolio-neuink-audit/crates/neuink-search/src/search_index_trait.rs:1-10`](/tmp/litfolio-neuink-audit/crates/neuink-search/src/search_index_trait.rs).
4. `mono-legacy-conversion` should reuse the atomic-file primitive concept but not mistake it for transactionality; conversion still needs the full staged backup/verify/promote/restore protocol.

The highest-risk false shortcut is to call a Cargo crate or React feature folder a plugin. NeuInk demonstrates that physical folders can coexist with a single global command surface, direct cross-feature imports, global workers, and shared authority. Mono acceptance must continue to be based on inclusion, permission, lifecycle, data ownership, failure isolation, and artifact evidence rather than directory shape.
