# Reader Annotations

## Purpose

Record the current Reader note/annotation models and isolate the future typed PDF annotation contract from current behavior.

## Current Implementation

The current Reader spans several persistence and UI models:

- `highlights` rows from migration `0001` store page, JSON rectangle, color, selected text, optional note, and later translation/summary/label/explanation fields.
- Ordinary highlight notes use the nullable `highlights.note` field and `highlight_update_note`.
- Standalone-looking PDF margin notes are still highlight rows. `src/pages/reader/pdfSelectionHelpers.ts` defines `READER_MARGIN_NOTE_LABEL = "reader-margin-note"`, and `isReaderMarginNote` classifies by that label.
- `PdfMarginNotesOverlay.tsx` renders, edits, moves, resizes, changes font-size metadata in the rectangle payload, and deletes those highlight-backed pseudo-notes.
- `PdfLinkedNoteBox.tsx` displays/edit notes attached to ordinary highlights.
- `NotesPane.tsx` edits the Markdown file resolved by `LibraryPaths::note_file`, currently `notes/<paper-id>.md`.
- `NoteSectionsPane.tsx` edits SQL rows in `paper_note_sections` from migration `0015`; `note_sections_get` creates defaults before listing.

The magic label is current behavior and future conversion input. It is not a durable type boundary.

## Planned Parent Contract

The `mono-reader-annotations` target introduces a discriminated `PdfHighlight | PdfTextNote` model, unscaled PDF page coordinates, dedicated `pdf_notes` persistence, typed parsers/commands, expected revisions, and serialized per-annotation writes. New runtime behavior will not determine note type from `reader-margin-note`.

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

## Validation

Current focused checks:

```bash
pnpm test -- src/pages/reader/pdfSelectionHelpers.test.ts src/pages/reader/NotesPane.test.tsx
cargo test --manifest-path src-tauri/Cargo.toml storage::highlights::tests
rg -n 'reader-margin-note|isReaderMarginNote' src src-tauri
```

Before promoting the planned contract, add create/edit/move/resize/style/delete/search/restart tests, stale-revision tests, zoom/resize rendering tests, migration idempotence, backup/restore, and Markdown/note-section preservation coverage.

## Anti-Patterns

- Documenting `PdfTextNote` or `pdf_notes` as current implementation.
- Adding another label-based note type.
- Persisting viewport pixels or zoom scale as future annotation geometry.
- Updating only the Reader component while leaving parser, command, repository, migration, mock, or parity contracts stale.
- Deleting Markdown or note-section data while replacing the default UI.

## Related Specs

- [Cross-Layer Index](./index.md)
- [Cross-Layer API Contracts](./api-contracts.md)
- [Storage and Migrations](../backend/storage-and-migrations.md)
- [Canonical Target Mono Contracts](./mono-contracts.md)
