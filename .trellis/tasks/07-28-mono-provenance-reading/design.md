# Provenance-Aware Core Reading Design

## 1. Scope

This child creates the V1 data and workflow foundation for evidence-backed reading. It does not build the V1.1 Reflow/multi-pane/rich-editor experience.

Core remains authoritative for accepted documents, source evidence, user notes, annotations, local keyword search, and baseline export. `document-services` may produce candidates, but disabling it never makes accepted evidence unavailable.

## 2. Target Modules

### Rust/backend

```text
crates/litfolio-domain/             # if established by mono-core-boundaries
  documents.rs                      # IDs, revisions, segments, anchors, resolution states
  provenance.rs                     # source-link/snapshot value types

src-tauri/src/storage/
  document_revisions.rs             # revision/segment repository and compatibility projection
  note_documents.rs                 # stable note identity, revision, content hash
  source_links.rs                   # links, refs, remap reports, indexed backlinks
  atomic_write.rs                   # scoped temp/sync/replace primitive

src-tauri/src/core/
  documents/accept.rs               # candidate validation and staged activation
  documents/remap.rs                # deterministic old/new segment resolver
  notes/save.rs                     # expected-revision note/link mutation
  provenance/resolve.rs             # live/snapshot resolution

src-tauri/src/commands/
  core_documents.rs                 # typed candidate/revision/segment IPC adapters
  core_provenance.rs                # source link/backlink/resolve adapters
  core_notes.rs                     # versioned note API; compatibility adapter remains
```

Do not create one broad IPC crate. Repositories remain private to core services. Plugin-facing capability adapters accept opaque handles and normalized DTOs.

### TypeScript/frontend

```text
src/core/domain/documents.ts
src/core/domain/provenance.ts
src/core/data/documents.ts
src/core/data/provenance.ts
src/core/data/notes.ts
src/core/controllers/noteController.ts
src/core/controllers/sourceNavigationController.ts
src/features/reader/source-preview/
src/features/reader/backlinks/
```

All IPC responses use runtime parsers. `ReaderPage` assembles controllers/components and does not own save ordering or persistence.

## 3. Persistence Model

Use the next available migration number at implementation time. Historical migrations remain unchanged.

### 3.1 Document revisions

```sql
CREATE TABLE document_revisions (
  id TEXT PRIMARY KEY NOT NULL,
  paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL,
  schema_version INTEGER NOT NULL,
  source_hash TEXT NOT NULL,
  markdown TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('staged', 'active', 'superseded', 'rejected')),
  source_kind TEXT NOT NULL,
  source_owner TEXT,
  source_version TEXT,
  created_at INTEGER NOT NULL,
  accepted_at INTEGER,
  UNIQUE(paper_id, ordinal)
);

CREATE UNIQUE INDEX document_revisions_one_active
  ON document_revisions(paper_id)
  WHERE state = 'active';
```

`source_owner` is descriptive provenance, never authority. It may name a parser plugin but contains no task secret or raw provider payload.

### 3.2 Segments

```sql
CREATE TABLE document_segments (
  id TEXT PRIMARY KEY NOT NULL,
  revision_id TEXT NOT NULL REFERENCES document_revisions(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL,
  page INTEGER NOT NULL,
  x REAL,
  y REAL,
  width REAL,
  height REAL,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  markdown TEXT,
  asset_ref TEXT,
  quote_hash TEXT NOT NULL,
  continuation_group_id TEXT,
  visual_group_id TEXT,
  UNIQUE(revision_id, ordinal),
  UNIQUE(revision_id, id),
  CHECK((x IS NULL AND y IS NULL AND width IS NULL AND height IS NULL) OR
        (x IS NOT NULL AND y IS NOT NULL AND width IS NOT NULL AND height IS NOT NULL))
);
```

Geometry uses unscaled PDF page coordinates. Service validation additionally checks finite numbers, non-negative dimensions, known page bounds, bounded text/Markdown, and safe asset handles.

### 3.3 Stable note identity

```sql
CREATE TABLE core_notes (
  id TEXT PRIMARY KEY NOT NULL,
  paper_id TEXT NOT NULL UNIQUE REFERENCES papers(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
```

Backfill assigns deterministic IDs such as `paper-note:<paper-id>` and hashes the existing file. It never rewrites file content. The path remains resolved through `LibraryPaths`; no path is stored in plugin-facing DTOs.

### 3.4 Links and refs

```sql
CREATE TABLE source_links (
  id TEXT PRIMARY KEY NOT NULL,
  owner_kind TEXT NOT NULL CHECK(owner_kind IN ('note', 'highlight', 'pdf-note')),
  owner_id TEXT NOT NULL,
  owner_anchor_kind TEXT NOT NULL,
  owner_anchor_json TEXT NOT NULL,
  owner_revision INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE source_link_refs (
  id TEXT PRIMARY KEY NOT NULL,
  link_id TEXT NOT NULL REFERENCES source_links(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL,
  original_revision_id TEXT NOT NULL REFERENCES document_revisions(id),
  original_segment_id TEXT NOT NULL,
  resolved_revision_id TEXT REFERENCES document_revisions(id),
  resolved_segment_id TEXT,
  resolution_status TEXT NOT NULL CHECK(resolution_status IN ('current', 'moved', 'changed', 'missing')),
  snapshot_page INTEGER NOT NULL,
  snapshot_x REAL,
  snapshot_y REAL,
  snapshot_width REAL,
  snapshot_height REAL,
  snapshot_kind TEXT NOT NULL,
  snapshot_text TEXT NOT NULL,
  snapshot_markdown TEXT,
  snapshot_asset_ref TEXT,
  quote_hash TEXT NOT NULL,
  UNIQUE(link_id, ordinal)
);
```

Indexes cover `(owner_kind, owner_id)`, original and resolved segment pairs, revision/status, and quote hash. Foreign-key choices must retain old evidence when a revision is superseded. Rejected/staged revisions with no accepted links may be garbage-collected; accepted/superseded evidence is preserved.

`owner_anchor_json` is a versioned validated union. V1 supports note-root, Markdown range with note revision/hash, highlight, and PDF-note anchors. V1.1 may add rich-editor marker IDs without replacing the table.

## 4. Compatibility and Backfill

`paper_documents` remains the current-document projection and keeps its FTS triggers. During activation, the core service updates it from the accepted revision in the same SQLite transaction that flips active state. Existing search and Ask compatibility callers therefore see the active Markdown.

Existing `document.md` remains a compatibility/portable cache, not the authority after this child. Reads migrate to the revision repository first and fall back to legacy file/database state for libraries not yet backfilled.

Backfill behavior:

1. For each `paper_documents` row, create one active revision with a deterministic migration source and no segments unless reliable segment data exists.
2. For a non-empty legacy `document.md` missing from `paper_documents`, import one active unsegmented revision only after hash/content reconciliation.
3. For every existing per-paper note, create/update its `core_notes` identity and hash without changing bytes.
4. Do not infer source anchors from legacy Markdown or geometry unless the match is deterministic and verified.
5. Produce counts and mismatch reports; preserve conflicting inputs for manual review.

## 5. Candidate Acceptance

### 5.1 DTO

```ts
type DocumentCandidate = {
  schemaVersion: number;
  paperId: string;
  sourceHash: string;
  source: { kind: "pdfjs" | "plugin"; owner?: string; version: string };
  markdown: string;
  segments: CandidateSegment[];
  assetHandles: string[];
  warnings: StructuredWarning[];
};
```

A plugin instance binding is transport metadata injected by the host. The candidate's `source.owner` does not grant access.

### 5.2 Flow

```text
submit candidate
  -> verify caller/permission and paper/source ownership
  -> validate schema, source hash, sizes, pages, geometry, ordering, assets
  -> stage normalized markdown/assets and durable intent
  -> insert staged revision + segments
  -> compute remap plan, backlink impact, and validation report
  -> atomically promote compatibility file with backup
  -> transaction: old active -> superseded; staged -> active;
                  update paper_documents/FTS; apply remap statuses
  -> finalize journal and remove backup/staging
```

Any failure before final commit leaves the old active revision. A failure after file promotion restores the backup or leaves a durable recovery intent that startup resolves before serving the new revision. Late/cancelled plugin work cannot commit because authority generation and cancellation are rechecked immediately before activation.

Local PDF.js extraction uses the same service. It may create an unsegmented or page-level candidate; it does not bypass validation.

## 6. Remapping

Remapping is deterministic and conservative:

1. Exact original segment ID in an equivalent revision is current.
2. Unique exact quote hash + semantic kind + compatible page/geometry is moved or current.
3. Unique normalized text hash with neighbor/order evidence may be changed/moved according to explicit thresholds.
4. Ambiguous or absent matches are missing; no arbitrary first match is selected.

The report records counts, mapping reasons, ambiguities, and old/new revision IDs. Original IDs and snapshots never change. Only resolved pointers/statuses update in one transaction with expected link revisions.

## 7. Note and Link Writes

`note_get_v2` returns ID, paper ID, content, content hash, revision, link summaries, and timestamps. `note_save_v2` accepts expected revision/hash, content, and link mutations.

The backend:

1. validates every link owner and source ref;
2. writes new Markdown to a same-directory temp file and syncs it;
3. opens a DB transaction and checks expected note/link revisions;
4. records a durable commit intent when file and DB both change;
5. atomically replaces the note file;
6. commits note metadata and link mutations;
7. writes a receipt/final state and removes recovery artifacts.

Injected failures at each stage prove restore/replay behavior. The legacy `note_get`/`note_save` remain adapters until all callers migrate; adapter writes still use the safe service and return structured conflicts where the transport permits.

The frontend controller serializes saves per note, retains the latest draft, flushes before close, and never marks an older response as the newest saved state.

## 8. Reader and Export UX

V1 adds bounded UI, not a redesign:

- source preview for text/Markdown/table/formula/image snapshots;
- open/locate source in the current PDF when live geometry exists;
- link status and snapshot fallback when content moved/changed/missing;
- backlinks list for the current segment/source;
- explicit create/remove source link actions from supported selections;
- visible dirty/saving/conflict/recovery states.

Markdown export supports configurable human-readable references, internal stable IDs, snapshot excerpts/assets, and a machine-readable provenance block. Changed/missing links appear in an export report. Core baseline export does not depend on an export plugin.

## 9. Failure and Degradation

| Condition | Required behavior |
| --- | --- |
| No accepted revision | Existing PDF, note, annotation, local metadata search, and export remain available |
| Active revision has no segments | Markdown and FTS work; source-link creation requiring a segment is unavailable with a structured reason |
| `document-services` disabled/excluded | Existing revisions, segments, snapshots, backlinks, Reader navigation, and export work; no parser UI/jobs remain |
| Candidate invalid/failed/cancelled | Prior active revision and compatibility files remain authoritative |
| Link live target missing | Render immutable snapshot and `missing` status |
| Note revision conflict | Keep draft, return current revision/hash, offer explicit reload/merge/retry; never overwrite silently |
| Crash during cross-resource write | Startup recovery completes or restores from intent/backup before opening the affected note/revision |
| Asset missing | Render text/metadata fallback and structured warning; do not break the note/Reader page |

## 10. Tests

- Schema/backfill fixtures for empty, legacy file-only, DB-only, matching, and conflicting documents/notes.
- Candidate validation and injected failure at validation, stage, file promotion, DB commit, and cleanup.
- One-active-revision invariant, prior revision retention, FTS projection parity, and restart recovery.
- Source-link CRUD, snapshot immutability, indexed backlinks, every resolution state, ambiguous remap, and deterministic reports.
- Expected-revision note/link conflicts, rapid saves, unmount/app-close flush, and crash draft recovery.
- Core-only and disabled/excluded `document-services` Reader/export E2E.
- Import-boundary, command-parity, runtime parser, and plugin capability/late-result checks.

## 11. Rollout and Rollback

Ship behind compatibility adapters until backfill, active projection parity, Reader save behavior, export, and disabled-plugin tests pass. Do not delete `paper_documents`, `document.md`, `note.md`, old commands, or old reads in this child.

Before migration, create a library backup and preflight free space. A migration failure restores the original database/files. Rollback to the old application remains possible because original note/document files are preserved and new tables do not alter old migration history.
