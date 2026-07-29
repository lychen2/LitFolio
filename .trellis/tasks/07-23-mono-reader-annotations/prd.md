# Rebuild Reader PDF Annotations

## Goal

Replace highlight-label sentinel text boxes and ineffective default note panes with a dedicated, reliable PDF annotation model and Reader controller.

## Dependencies

- `mono-core-boundaries` is completed and archived.
- Parent Reader annotation, migration, and rollback contracts are approved.

## Requirements

- Implement the core discriminated union `ReaderAnnotation = PdfHighlight | PdfTextNote`.
- Add a dedicated `pdf_notes` persistence model with page-space geometry, content, color, font size, opacity, revision, and timestamps.
- Support create, edit, select, move, resize, style, delete, list, search, and restart persistence for `PdfTextNote`.
- Keep optional text associated with a selected highlight as part of `PdfHighlight`; do not conflate it with standalone text notes.
- Remove runtime type inference from `label === "reader-margin-note"`; retain the sentinel only as legacy conversion input.
- Move annotation queries, mutation ordering, debounce, pending state, conflict handling, and close/flush behavior into a Reader controller.
- Use expected revisions and per-annotation serialized writes so older requests cannot overwrite newer text or geometry.
- Provide idempotent conversion support for legacy margin notes and deterministic export of Markdown notes/note sections without deleting originals.
- Preserve equivalent PDF placement across zoom and resize using normalized unscaled page coordinates.

## Constraints

- Historical migrations `0001`-`0035` remain unchanged; add a new migration.
- Reader local behavior must work without an AI profile or network.
- Existing ordinary highlights, translations, summaries, explanations, and linked notes remain intact.
- Full-library legacy conversion orchestration remains owned by `mono-legacy-conversion`.
- No broad Reader visual redesign.

## Out of Scope

- AI Reading extraction or plugin Reader actions.
- Removing original Markdown note files after export.
- Migrating optional plugin data.

## Acceptance Criteria

- [ ] `PdfTextNote` has an independent Rust/SQLite/TypeScript type and no new write depends on the margin-note label.
- [ ] Text notes create, edit, move, resize, style, delete, search, and survive app/Reader restart at multiple zoom levels.
- [ ] Rapid interleaved text/geometry updates either serialize or return a structured revision conflict; stale writes never win silently.
- [ ] Ordinary highlights and highlight-linked note text retain existing behavior and data.
- [ ] Legacy margin-note conversion and note-section/Markdown archive export are idempotent, counted, backed up, and covered by failure-restore fixtures.
- [ ] Reader opens and all local annotation operations work without network or an AI profile.
- [ ] Focused frontend/Rust tests, typecheck, lint, full Vitest, relevant Cargo tests, and Reader Playwright flows pass.

## Source Anchors

- `src/pages/ReaderPage.tsx`, `src/pages/reader/PdfPane.tsx`
- `src/pages/reader/PdfMarginNotesOverlay.tsx`, `PdfLinkedNoteBox.tsx`, `pdfSelectionHelpers.ts`
- `src/pages/reader/NotesPane.tsx`, `NoteSectionsPane.tsx`, `ReaderWorkspacePane.tsx`
- `src-tauri/src/commands/highlights.rs`, `commands/notes.rs`
- `src-tauri/src/storage/highlights.rs`, `storage/note_sections.rs`, `storage/notes.rs`
- `src-tauri/migrations/0001_init.sql`, `0015_note_sections.sql`, `0018_highlight_labels.sql`
- `src/styles/reader.css`
