# Rebuild Reader PDF Annotations - Design

## 1. Scope / Trigger

This child owns the core annotation model, storage, controller, and legacy note export primitives. It starts after structural boundaries exist and finishes before the plugin host relies on Reader slots.

## 2. Signatures

### TypeScript

```ts
type ReaderAnnotation = PdfHighlight | PdfTextNote;

type PdfTextNote = {
  kind: "text-note";
  id: string;
  paperId: string;
  rect: { page: number; x: number; y: number; width: number; height: number };
  content: string;
  color: string;
  fontSize: number;
  opacity: number;
  revision: number;
  createdAt: number;
  updatedAt: number;
};

type PdfTextNotePatch = Partial<Pick<
  PdfTextNote,
  "rect" | "content" | "color" | "fontSize" | "opacity"
>> & { expectedRevision: number };
```

### Tauri Commands

```text
pdf_note_create(paperId, input) -> PdfTextNote
pdf_note_list(paperId) -> PdfTextNote[]
pdf_note_update(id, patch) -> PdfTextNote
pdf_note_delete(id, expectedRevision) -> void
pdf_note_search(query, paperId?) -> PdfTextNoteSearchResult[]
legacy_reader_notes_preview() -> LegacyReaderNotesReport
legacy_reader_notes_export(destination?) -> LegacyReaderNotesReport
```

### Rust / SQLite

```rust
struct PdfNote { id, paper_id, page, x, y, width, height, content,
                 color, font_size, opacity, revision, created_at, updated_at }
```

`pdf_notes` follows the parent schema contract and adds indexes for paper/page and updated time. Search uses a dedicated FTS table or an equivalent tested indexed path owned by core.

## 3. Contracts

- Geometry uses the unscaled PDF page coordinate system; viewport pixels and zoom are derived only in the renderer.
- Width/height are positive and remain within the page after clamp/validation.
- Style bounds are explicit and shared by frontend parser and backend validator.
- Update is atomic: `WHERE id = ? AND revision = expected_revision`, then increments revision.
- A zero-row update returns `annotation_revision_conflict` with current data/revision when present, or `annotation_not_found`.
- The controller keeps one mutation queue per annotation and coalesces compatible pending patches without reordering persisted revisions.
- Unmount/close flushes, offers retry, or retains visible unsaved state; it never reports saved before persistence succeeds.
- Legacy sentinel rows are read-only migration input once new writes are enabled.
- Markdown files are preserved. Structured sections export with key, order, source, and content; empty defaults are counted separately.

## 4. Validation & Error Matrix

| Input/condition | Error/result |
| --- | --- |
| paper missing | `paper_not_found` |
| invalid page or non-finite geometry | `annotation_invalid_geometry` |
| out-of-range style | `annotation_invalid_style` |
| stale expected revision | `annotation_revision_conflict` plus current note |
| note missing | `annotation_not_found` |
| blank content | allowed while editing; hidden in passive rendering if empty |
| legacy duplicate mapping | existing deterministic target reused; report as already converted |
| archive write failure | conversion/export aborts and restores staged files |
| no AI profile/network | no effect on local annotation commands |

## 5. Good / Base / Bad Cases

- Good: rapid typing and drag updates are queued, revisions increase monotonically, and reopening shows the latest text and rectangle.
- Base: a blank new note is persisted, edited, and hidden from passive view until it has visible content.
- Bad: two debounced requests finish out of order and the older response overwrites the database or UI snapshot.

## 6. Tests Required

- Parser/domain tests for the discriminated union and style/geometry limits.
- Controller fake-timer tests for debounce, queue ordering, retry, conflict, unmount/flush, and paper switching.
- Component tests for draw, edit, move, resize, style, delete, keyboard/focus, and passive display.
- Rust repository/command tests for CRUD, revision compare-and-swap, cascade, search, and invalid input.
- Migration fixtures for sentinel rows, ordinary highlights, Markdown notes, note sections, idempotence, backup, and injected failure.
- Playwright Reader annotation flow at multiple zoom levels and after reload.
- Existing highlight/translation/explanation tests remain green.

## 7. Wrong vs Correct

Wrong:

```ts
const marginNotes = highlights.filter((item) =>
  item.label === "reader-margin-note"
);
```

Correct:

```ts
const textNotes = annotations.filter(
  (item): item is PdfTextNote => item.kind === "text-note",
);

await controller.updateTextNote(note.id, {
  content,
  expectedRevision: note.revision,
});
```
