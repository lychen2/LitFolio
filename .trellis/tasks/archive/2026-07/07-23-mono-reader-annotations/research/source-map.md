# Reader Annotation Source Map

## Current Persistence Systems

- `NotesPane.tsx` -> `note_get`/`note_save` -> `notes/<paper-id>.md`.
- `NoteSectionsPane.tsx` -> note-section commands/repository -> `paper_note_sections` from migration `0015`.
- `PdfLinkedNoteBox.tsx` -> `highlight_update_note` -> optional note on ordinary highlight.
- `PdfMarginNotesOverlay.tsx` -> highlight CRUD/rect updates -> pseudo-highlight with label `reader-margin-note`.

## Existing Behavior to Reuse

`PdfMarginNotesOverlay` already contains draw, move, resize, font-size, select, edit, and delete interactions plus page-to-overlay coordinate conversion. Reuse behavior through a controller and explicit model; do not preserve the sentinel data shape.

`PdfLinkedNoteBox` distinguishes dirty drafts from incoming server values and has sequence-aware UI state. The new revision/queue contract must close the remaining backend stale-write gap rather than discard this behavior.

## Data Anchors

- `highlights` begins in `0001_init.sql`; note, text, color, and rect JSON share one row.
- `0018_highlight_labels.sql` adds the discriminator currently used by margin notes.
- `0014_fts_extend.sql` builds highlight FTS; text-note search needs explicit ownership.
- `0007`, `0008`, and `0026` add AI fields to highlights that must not be inherited by standalone text notes.

## Migration Split

This task supplies the annotation-specific converter and tests. `mono-legacy-conversion` later orchestrates it with all plugin-store migrations and atomic whole-library rollback.
