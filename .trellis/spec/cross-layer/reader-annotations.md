# Reader Annotations

## Purpose

Record the current Reader note/annotation models and isolate the future typed PDF annotation contract from current behavior.

## Current Implementation

## Current Implementation

The Reader spans several persistence models:

- `highlights` rows from migration `0001` store page, JSON rectangle, color, selected text, optional note, and later translation/summary/label/explanation fields. Ordinary highlight notes use the nullable `highlights.note` field and `highlight_update_note`.
- `pdf_notes` from migration `0036` is the dedicated text-note model (`PdfTextNote`): unscaled PDF page coordinates, content, color/fontSize/opacity style, expected-revision compare-and-swap, FTS5 search, and a UNIQUE `legacy_highlight_id` link used by the converter. `src/core/contracts/readerAnnotations.ts` owns the `ReaderAnnotation = PdfHighlight | PdfTextNote` discriminated union plus shared geometry/style limits.
- `src/features/reader/annotationController.ts` owns the per-annotation mutation queue: debounced/coalesced writes, monotonic revisions, revision-conflict recovery with retry, paper-switch cancellation, and unmount/close flush that never reports saved before persistence.
- `PdfMarginNotesOverlay.tsx` renders/edits/moves/resizes/deletes `PdfTextNote` rows through the controller; geometry is unscaled PDF page coordinates with zoom derived only in the renderer.
- `PdfLinkedNoteBox.tsx` still displays/edits notes attached to ordinary highlights.
- `NotesPane.tsx` edits the per-paper Markdown note file; `NoteSectionsPane.tsx` edits `paper_note_sections` from migration `0015`. Both remain in place until `mono-provenance-reading` replaces the note controller.
- Legacy `reader-margin-note` highlight rows are read-only conversion input: `src-tauri/src/storage/legacy_reader_notes.rs` previews and converts them to `pdf_notes` with deterministic ids (`legacy-<highlight-id>`), backed up, idempotent, failure-rolled-back exports, and deterministic Markdown/section archives. New writes never use the label.

## Implemented Target (mono-reader-annotations)

The discriminated `PdfHighlight | PdfTextNote` model, unscaled PDF page coordinates, dedicated `pdf_notes` persistence, typed parsers/commands, expected revisions, and serialized per-annotation writes are implemented by the `mono-reader-annotations` child. Runtime behavior no longer determines note type from `reader-margin-note`.

Deferred to later children: the default Markdown note pane and legacy note commands/files stay until `mono-provenance-reading` delivers the revision-safe note controller and source-link workflow; whole-library conversion orchestration and startup conversion belong to `mono-legacy-conversion` (which consumes the converter primitives here).
That target is not implemented by this spec. Its exact domain/schema/mutation behavior remains owned by `.trellis/tasks/07-23-litfolio-mono/design.md` and `.trellis/tasks/07-23-mono-reader-annotations/design.md` until the child lands. Existing Markdown notes and structured note sections must be preserved/exported by the conversion path; they are not silently discarded.

## Source Examples

- `src/pages/reader/pdfSelectionHelpers.ts`: current sentinel constant and classifier.
- `src/pages/reader/PdfMarginNotesOverlay.tsx`: current highlight-backed text-box behavior.
- `src/pages/reader/PdfLinkedNoteBox.tsx`: current ordinary-highlight note editor.
- `src/pages/reader/NotesPane.tsx`: current Markdown note editor.
- `src/pages/reader/NoteSectionsPane.tsx`: current structured note cards.
- `src-tauri/src/commands/highlights.rs` and `src-tauri/src/storage/highlights/`: current highlight IPC/repository.
- `src-tauri/src/commands/notes.rs` and `src-tauri/src/storage/notes.rs`: current Markdown note IPC/storage.
- `src-tauri/migrations/0001_init.sql`, `0015_note_sections.sql`, and `0018_highlight_labels.sql`: current persistence history.
- `src-tauri/migrations/0036_pdf_notes.sql`, `src-tauri/src/storage/pdf_notes.rs`, and `src-tauri/src/commands/pdf_notes.rs`: the dedicated text-note model.
- `src-tauri/src/storage/legacy_reader_notes.rs` and `src-tauri/src/commands/legacy_reader_notes.rs`: the legacy converter and archive export.
- `src/core/contracts/readerAnnotations.ts`, `src/features/reader/annotationController.ts`, `src/lib/apiSchemaReader.ts`, and `src/core/data/readerClient.ts`: typed annotation boundary.
## Validation

Current focused checks:

```bash
pnpm test -- src/pages/reader/pdfSelectionHelpers.test.ts src/pages/reader/NotesPane.test.tsx src/core/contracts/readerAnnotations.test.ts src/features/reader/annotationController.test.ts src/lib/apiSchemaReader.test.ts src/core/data/clients.test.ts
cargo test --manifest-path src-tauri/Cargo.toml pdf_note
cargo test --manifest-path src-tauri/Cargo.toml legacy_reader_notes
rg -n 'reader-margin-note|isReaderMarginNote' src src-tauri
```

Coverage now includes create/edit/move/resize/style/delete/search/restart controller tests, stale-revision compare-and-swap fixtures, parser/domain limit tests, migration idempotence, backup/injected-failure/restore/second-run converter fixtures, and deterministic archive assertions. Full gate: `pnpm typecheck`, `pnpm lint:strict`, `pnpm test`, full `cargo test`, and the Reader Playwright smoke.

## Anti-Patterns

- Adding another label-based note type.
- Persisting viewport pixels or zoom scale as future annotation geometry.
- Updating only the Reader component while leaving parser, command, repository, migration, mock, or parity contracts stale.
- Deleting Markdown or note-section data while replacing the default UI.

## Related Specs

- [Cross-Layer Index](./index.md)
- [Cross-Layer API Contracts](./api-contracts.md)
- [Storage and Migrations](../backend/storage-and-migrations.md)
- [Canonical Target Mono Contracts](./mono-contracts.md)
