# Build Provenance-Aware Core Reading

## Goal

Add core-owned accepted document revisions, stable source segments, source links and snapshots, indexed backlinks, transactional note saves, and parser-plugin acceptance boundaries. Preserve Mono core functionality when `document-services` is disabled or excluded.

## Dependencies

- `mono-core-boundaries` is completed and archived with typed core API/domain boundaries and zero-network startup ownership resolved.
- `mono-reader-annotations` is completed and archived with revision-safe `PdfHighlight | PdfTextNote` persistence and Reader controllers.
- Parent document ownership, plugin authority, data preservation, and rollback contracts are approved.

## Requirements

- **PROV-001 - Accepted revisions:** Introduce parser-neutral, versioned `DocumentRevision`, `DocumentSegment`, and `SegmentAnchor` core types. At most one accepted revision is active for a paper; previous revisions remain available for provenance and remapping.
- **PROV-002 - Compatibility projection:** Keep `paper_documents` and current Markdown reads working as the active revision projection during migration. Existing papers without segment data remain valid and usable.
- **PROV-003 - Candidate acceptance:** Local PDF.js extraction and authorized parser plugins submit staged document candidates. Only a core service validates and atomically accepts candidates, updates canonical Markdown/segments/FTS, and supersedes the prior revision.
- **PROV-004 - Stable anchors:** Segment IDs are stable within a revision. User annotations retain PDF/page geometry and stable core IDs; parser-derived IDs never become their sole identity.
- **PROV-005 - Source links:** Add core source links from stable note/annotation anchors to one or more segment references. Each reference stores an immutable text/Markdown/asset snapshot, page, PDF-space geometry, semantic kind, and quote hash.
- **PROV-006 - Resolution and backlinks:** Resolve links as `current`, `moved`, `changed`, or `missing`, use snapshots when live content is unavailable, and provide indexed note-to-source and source-to-note queries without scanning all notes in the frontend.
- **PROV-007 - Reparse remapping:** Accepting a new revision performs deterministic, ambiguity-safe remapping and reports unchanged, moved, changed, and unresolved counts. It never silently discards or rewrites source evidence.
- **PROV-008 - Revision-safe notes:** Give existing per-paper Markdown notes stable deterministic IDs, content hashes, and revisions without rewriting their content. Note saves use expected revisions and do not allow stale requests to overwrite newer content.
- **PROV-009 - Recoverable writes:** Use atomic replacement for Markdown/files and a transaction or durable stage journal for note-plus-link and revision-plus-file operations. Failed saves keep drafts visible; app/Reader close flushes or reports pending writes.
- **PROV-010 - Baseline Reader UX:** V1 exposes source preview, open/locate source, link status, backlinks, and snapshot fallback through core Reader/note surfaces. It does not require the V1.1 rich editor or generic multi-pane workspace.
- **PROV-011 - Export:** Baseline Markdown export can materialize human-readable source references and snapshots and reports unresolved/changed links rather than silently dropping them.
- **PROV-012 - Plugin independence:** Accepted revisions, segments, links, snapshots, backlinks, notes, local keyword search, and baseline export continue to work after `document-services` is disabled or removed from the build.

## Constraints

- Add new migrations after the current highest migration; do not edit historical migrations `0001` through `0035`.
- Preserve existing `document.md`, `note.md`, note-section rows, highlights, and planned `pdf_notes`; do not rewrite legacy note text during backfill.
- Keep `PdfHighlight | PdfTextNote` and normalized page geometry authoritative. Source anchors are nullable enrichment.
- Parser/provider task IDs, raw payloads, retry state, and service metadata stay in `document-services` sidecar storage. Core stores only normalized accepted provenance and a non-secret source attribution.
- Plugins receive typed candidate/link/navigation capabilities and opaque asset handles; they do not receive `library.db`, raw `LibraryPaths`, core repository objects, or arbitrary Tauri invocation.
- No synchronized Reflow UI, generic workspace surfaces, broad visual redesign, or full rich-text editor in this task.
- Preserve unrelated worktree changes and use narrow task-owned edits.

## Out of Scope

- Implementing MinerU, custom parser providers, embeddings, semantic/hybrid search, or full-library Ask.
- V1.1 synchronized PDF/Reflow content modes, tabbed multi-pane workspace, and rich source-link editor atoms.
- Replacing the existing PDF renderer.
- Converting structured note sections into editable rich notes or deleting original Markdown files.
- Dynamic plugin installation, process/MCP tools, or broad network/filesystem capabilities.

## Acceptance Criteria

- [ ] Existing and newly extracted paper Markdown is represented by one active core document revision while compatibility reads and core FTS return equivalent current content.
- [ ] Valid candidate activation is stage/validate/commit safe; malformed geometry, wrong source hash, oversized output, cancellation, and injected failures leave the previous active revision and files unchanged.
- [ ] Source links round-trip with immutable snapshots; live, moved, changed, and missing states resolve deterministically; backlinks are served by an indexed core query.
- [ ] Reparse fixtures produce deterministic remap reports and preserve every original snapshot and unresolved reference.
- [ ] Rapid concurrent note/link edits use expected revisions; stale writes return a structured conflict and a crash/failure cannot leave a silently partial note/link mutation.
- [ ] Reader close, paper change, and app shutdown flush pending writes or keep a visible recoverable draft/error state.
- [ ] Existing note and document files are preserved byte-for-byte during backfill; papers without segments and links remain fully usable.
- [ ] Baseline Markdown export materializes source provenance and reports unresolved evidence without requiring an optional plugin.
- [ ] Core-only and `document-services`-disabled tests prove accepted documents, source previews, backlinks, notes, annotations, keyword search, and export remain usable with zero network activity.
- [ ] Focused frontend/Rust tests, migration/failure fixtures, typecheck, lint, Vitest, applicable Cargo tests, command parity, and Reader Playwright flows pass.

## Source Anchors

- `src-tauri/migrations/0031_paper_documents.sql`
- `src-tauri/src/storage/paths.rs`, `storage/notes.rs`, document/search repositories
- `src-tauri/src/commands/papers.rs`, `commands/notes.rs`, Reader/export command modules
- `src-tauri/src/export/markdown.rs`
- `src/lib/apiAiReader.ts`, schema parsers, command-parity tests
- `src/pages/ReaderPage.tsx`, `src/pages/reader/PdfPane.tsx`, `NotesPane.tsx`
- `07-28-mono-neuink-integration-study/research/neuink-reading-workflows.md`
- `07-28-mono-neuink-integration-study/research/neuink-ai-search-jobs.md`
