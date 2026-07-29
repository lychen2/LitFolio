# LitFolio Mono Architecture Design

## 1. Scope and Authority

This document defines cross-child contracts for the Mono refactor. Child designs may add detail but MUST NOT weaken these boundaries without first revising the parent PRD and this document.

The current code remains the migration source, not the target architecture. In particular, static routes, the global `api` aggregator, the chained Tauri handler macros, and highlight-backed margin notes are documented current constraints rather than approved target patterns.

## 2. Target Layers and Dependency Direction

The frontend target is organized by ownership:

```text
src/
  app/          # boot, providers, shell composition, route host
  core/         # stable library, reader, annotations, AI Reading domains
  features/     # core feature presentation assembled by app
  plugins/      # first-party plugin implementations and build registry
  plugin-sdk/   # public manifest, capability, slot, event, and test contracts
```

Allowed dependency direction:

```text
app -> core + features + plugin-sdk
features -> core + plugin-sdk slot types
plugins -> plugin-sdk + granted capability interfaces
core -> core only
plugin-sdk -> stable shared value types only
```

Core MUST NOT import a plugin implementation. Plugin-to-plugin calls go through declared dependencies and capability contracts, never direct implementation imports.

`ReaderPage` is an assembly layer. Reader ownership is split into:

- model: annotation and reading-session value types;
- data: typed core IPC repositories and parsers;
- controller: query/mutation ordering, save queues, and workflow state;
- components: presentation with explicit props;
- extensions: stable Reader slots supplied by the plugin host.

The monolithic `src/lib/api.ts` is replaced by explicit core API modules and plugin-scoped clients. Compatibility re-exports may exist temporarily and must be deleted after parity tests pass.

## 3. Core Storage Boundary

Core continues to own `<library-root>/library.db` and canonical core files under `papers/`, `notes/`, `attachments/`, `backups/`, and `logs/`.

Core-owned persisted domains are:

- papers and local metadata;
- tags, folders, and their paper joins;
- PDF files, accepted parser-neutral document revisions and segments, and extracted/translated document Markdown;
- core source links, immutable snapshots, remap state, indexed backlinks, and stable note identities;
- PDF highlights and `pdf_notes`;
- core FTS indexes for papers, accepted documents/segments, highlights, notes, and terminology;
- AI Reading outputs and profile references that do not expose secrets;
- core jobs required for import, indexing, export, and user-triggered AI Reading.

Plugin-owned SQLite state lives at:

```text
<library-root>/plugins/<plugin-id>/data.db
```

A plugin receives a scoped storage service. It never receives a raw path to `library.db`. Cross-domain references use stable core IDs and capability calls; plugin tables do not add foreign keys into core tables.

Secrets remain behind a scoped secrets capability and keyring-backed implementation. Manifests declare secret namespaces; plugins cannot enumerate unrelated profiles or secrets.

### 3.1 Accepted Document and Provenance Boundary

Parser integrations stage `DocumentCandidate` values containing a source hash, normalized Markdown, parser-neutral segments, bounded assets, warnings, and non-secret source attribution. A candidate owner string is descriptive only; plugin authority comes from the host invocation binding.

Only a core acceptance service validates schema/version, source hash, sizes, page bounds, finite PDF-space geometry, segment ordering, and asset handles. Activation uses stage -> validate -> compatibility-file promotion -> SQLite transaction -> finalize. It preserves the prior active revision through any failure or cancellation, updates core Markdown/FTS as the active projection, and retains superseded revisions for evidence resolution.

Core source links bind stable note/annotation anchors to accepted segment refs. Every ref retains an immutable page/geometry/type/text/Markdown/asset snapshot and quote hash. Resolution is `current`, `moved`, `changed`, or `missing`; indexed backlinks are served by core storage, never a frontend library-wide scan. Parser disable removes provider UI/jobs but not accepted revisions, links, snapshots, backlinks, Reader navigation, or baseline export.

Existing papers and notes may remain unsegmented/unlinked. Backfill assigns deterministic note identities and revision/hash metadata without rewriting Markdown. Existing PDF annotation geometry remains authoritative; a segment anchor is nullable enrichment.

## 4. Reader Annotation Contract

### 4.1 Domain Types

```ts
type ReaderAnnotation = PdfHighlight | PdfTextNote;

type PdfRect = {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

type AnnotationBase = {
  id: string;
  paperId: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
};

type PdfHighlight = AnnotationBase & {
  kind: "highlight";
  rects: PdfRect[];
  selectedText: string;
  color: string;
  note: string | null;
};

type PdfTextNote = AnnotationBase & {
  kind: "text-note";
  rect: PdfRect;
  content: string;
  color: string;
  fontSize: number;
  opacity: number;
};
```

Coordinates are normalized to the unscaled PDF page coordinate system. Rendering scale is never persisted as annotation geometry.

### 4.2 Core Schema

A new core table owns text notes independently from `highlights`:

```sql
CREATE TABLE pdf_notes (
  id TEXT PRIMARY KEY NOT NULL,
  paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  page INTEGER NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  width REAL NOT NULL,
  height REAL NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL,
  font_size REAL NOT NULL,
  opacity REAL NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

The owning child may refine constraints and index names, but it must retain an explicit type, page-space geometry, style fields, revision, and timestamps.

### 4.3 Mutation Semantics

Create, update, move, resize, style, and delete are typed core commands. Every update includes the last observed revision. A stale write returns `annotation_revision_conflict` with the current revision; it does not silently overwrite newer text or geometry.

The frontend controller serializes writes per annotation. Debounce may reduce calls, but request completion order is never used as data order. Closing the Reader flushes or reports pending writes.

The legacy predicate `label === "reader-margin-note"` is migration input only. New runtime behavior MUST NOT use it to determine annotation type.

## 5. AI Reading Contract

AI Reading is core but remains optional at runtime:

- local Reader and annotation queries do not depend on an AI profile;
- one explicit active reading profile/model is resolved for Reader actions;
- network calls start only from user-triggered actions;
- current-paper and selected-text questions receive a host-constructed frozen context envelope with authorized refs, provenance, source hashes/revisions, budgets, truncation, and warnings;
- empty/current-paper scope never widens to unrelated papers, while plugin retrieval requires an explicit visible scope transition;
- plugin-only RAG, embeddings, Ask sessions, surveys, projects, and graph context are injected only through plugin capabilities;
- profile secrets are resolved in the backend and never returned to the frontend.

AI errors are structured as `ai_profile_missing`, `ai_profile_invalid`, `ai_request_failed`, or `ai_cancelled`. The Reader maps these to local recoverable states and does not fail its page boundary.

AI/tool output that would alter user-authored notes, annotations, tags, metadata, accepted documents, or research artifacts is persisted as a reviewable proposal with base revision/hash, digest, evidence, idempotency key, and apply receipt. Core rechecks permission, owner generation, target ownership, and base state before apply; conflict never silently rebases or overwrites.

Core owns redacted execution records for AI calls, plugin tools, network calls, schedules, parser jobs, proposal apply, cancellation, degradation, and privileged failure. Plugins cannot suppress the running/terminal trail or store secret values in it.

## 6. Plugin API Contract

### 6.1 Activation Surface

```ts
interface LitFolioPlugin {
  manifest: PluginManifestV1;
  activate(
    ctx: PluginContext,
  ): void | PluginDisposer | Promise<void | PluginDisposer>;
}

type PluginDisposer = () => void | Promise<void>;

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
```

Plugin identifiers are stable, lowercase, and namespace-safe. This canonical schema is validated at build and runtime. The selected frontend entry list, Cargo features, backend command slices, mocks, conversion inclusion plan, and runtime registry are generated from the same manifest set; contradictory or unsupported declarations fail before build/activation.

Activation is transactional from the host's perspective: contributions become visible only after validation and successful activation. On failure, registered resources are disposed in reverse order.

After activation validation, the host issues an opaque instance binding containing immutable plugin identity, generation, and granted operations. The frontend transport attaches the binding; Rust resolves it before every plugin-attributed operation. A request field, manifest ID, route, or TypeScript context is never authority. Bindings are invalidated before disable cleanup and cannot be reused after re-enable.

### 6.2 Fixed UI Slots

- `app.routes`
- `app.navigation`
- `app.commandPalette`
- `settings.sections`
- `library.toolbarActions`
- `library.rowActions`
- `library.detailSections`
- `library.filters`
- `import.sources`
- `reader.toolbarActions`
- `reader.selectionActions`
- `reader.sidePanels`
- `reader.annotationDecorators`
- `export.formats`
- `paper.detailActions`
- `jobs.renderers`

A contribution has a stable ID, owner plugin ID, ordering metadata, a capability declaration, and a disposer. Slot hosts define failure boundaries so one contribution cannot blank a core page.

V1 uses these bounded slots. V1.1 synchronized Reflow and generic split workspaces require separate typed `reader.contentModes` and `app.workspaceSurfaces` contracts, owner/version-aware state restoration, dirty-surface flushing, and parent design review before implementation.

### 6.3 Fixed Capabilities

- `papers`
- `annotations`
- `reader`
- `ai`
- `storage`
- `files`
- `network`
- `secrets`
- `jobs`
- `events`
- `ui`
- `i18n`
- `logger`

Capability objects are narrow operation interfaces, not flat permission labels. Each privileged grant declares resource scope, host/file/secret references, method/size/time limits, consent policy, execution-record redaction, and revocation semantics. Redirect targets are revalidated and a secret reference is applied only within a host-owned request adapter; plugins never receive the secret value.

Phase-one capability objects expose no raw `AppState`, SQLx pool, library/plugin path, generic Tauri `invoke`, process spawn, shell, local socket/TCP daemon, MCP runtime, or arbitrary command adapter. No capability implicitly grants another capability.

Structured plugin errors include:

```ts
type PluginErrorCode =
  | "plugin_disabled"
  | "plugin_instance_stale"
  | "permission_denied"
  | "scope_not_approved"
  | "plugin_incompatible"
  | "plugin_dependency_missing"
  | "plugin_activation_failed"
  | "plugin_disable_timeout";
```

### 6.4 Lifecycle State Machine

```text
excluded -> unavailable
included -> disabled -> enabling -> enabled -> disabling -> disabled
                       |                    |
                       +------ failed <-----+
```

Disable order is: revoke the current instance generation and stop accepting work; cancel plugin jobs and bounded-drain them; remove UI contributions, schedules, subscriptions, and retries; run the disposer; close storage; then publish disabled state. Every asynchronous callback, commit, event, cache update, toast, and retry carries the generation and is rejected when stale. Disposer failure or timeout is recorded but cannot preserve authority or contributions. Data remains on disk unless a separately confirmed archive/delete operation is introduced later.

## 7. Data Conversion Contract

Historical migrations `0001`-`0035` remain byte-for-byte unchanged.

Conversion uses:

1. preflight compatibility and free-space checks;
2. a complete backup of database and affected files;
3. a durable stage marker and conversion report;
4. a new core baseline plus plugin-side migrators;
5. verification of counts, stable IDs, required fields, and checksums where applicable;
6. atomic replacement only after verification;
7. automatic restoration on any failed stage.

Required mappings:

- legacy highlight rows marked `reader-margin-note` become `pdf_notes`;
- ordinary highlights remain highlights, including their linked note text;
- note sections export to `archives/legacy-notes/<paper-id>.md` with source metadata;
- existing Markdown note files remain preserved and referenced in the conversion report;
- plugin data moves to the owning sidecar database;
- when an owning plugin is absent, its data becomes a versioned recoverable archive rather than being dropped.

Converters are idempotent or explicitly detect completed conversion. A second run must not duplicate notes or plugin records. The converter consumes a resolved, versioned inclusion plan generated from canonical manifests, not caller-built plugin ID strings. Disabled-but-included data is preserved without activation; excluded-owner data is retained in a reversible archive; a stale inclusion plan fails before writes.

## 8. Build and Runtime Contracts

Tauri's `generate_handler!` produces a compile-time command registry. A canonical manifest compiler therefore generates coordinated Cargo features, feature-gated command slices, Vite entries, mocks, runtime registry inputs, and conversion inclusion metadata. Excluded frontend entries are never statically imported.

Runtime disable is a separate layer. It hides contributions, guards backend access, cancels work, and closes storage, but it does not prove code removal.

The build matrix minimally covers:

- core-only Mono;
- each first-party plugin added independently where dependency rules permit;
- the supported all-first-party build used for migration parity;
- incompatible manifest and missing dependency failures.

Plugin-exclusive dependencies, including feed parsing, graph rendering, WebDAV, embeddings, document services, and updater transport/scheduling, are feature-gated with their owner. Core-only startup/idle network instrumentation must record zero requests; update checks occur only from a user action or a persisted enabled `updates` schedule.

## 9. Compatibility and Rollback

- Old API names may re-export new core clients during migration, with parity tests covering payload and error behavior.
- Old routes may redirect to plugin routes only while the owning plugin is enabled.
- Every schema or file conversion has fixtures, backup verification, an injected-failure test, and a documented restore path.
- No child removes a compatibility path until old/new behavior passes equivalent tests and all dependents have migrated.
- No task uses `git reset`, `git clean`, `git checkout --`, or broad generated rewrites against the shared dirty worktree.

## 10. NeuInk Reuse and V1.1 Boundary

NeuInk commit `11b848e0cfe9100a0386bcf2d4f3b839148d3b99` is a behavior/contract reference. The default implementation track is clean LitFolio-native code based on this parent design and child tests, without copying NeuInk identifiers, prompts, UI text, CSS, assets, screenshots, or branding.

Any explicit source-reuse track is blocked until full upstream history and contributor/file provenance are independently reviewed. Once approved, it records repository commit, source and destination paths, modification date/reviewer, and applies Apache-2.0/NOTICE/change-notice requirements plus release SBOM/artifact review. NeuInk branding is not reused. Models and external services require separate version-pinned terms and privacy review; MinerU source bundling is blocked pending GPL compatibility review.

V1 delivers provenance, explicit context, proposal writes, execution records, canonical manifests, host authority, terminal disable, and zero-network startup. V1.1 may deliver synchronized PDF/Reflow, typed workspace surfaces, restorable layout/drafts, and richer source-aware editing only after V1 core-only and plugin-disabled acceptance tests pass.

## 11. Cross-Task Change Control

A child finding that changes core ownership, the annotation union, plugin capabilities/slots, storage isolation, historical migration immutability, or build/runtime semantics must return to parent planning. The parent PRD/design is revised before implementation continues.
