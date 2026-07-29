# Reader Note Systems

## Current Models

The current product has three persistence models surfaced through four frontend components. They overlap in purpose but have different identity, save, search, and migration behavior.

## 1. Markdown Note File

Anchors:

- `src/pages/reader/NotesPane.tsx`
- `src-tauri/src/commands/notes.rs`
- `src-tauri/src/storage/notes.rs`
- `src-tauri/src/storage/paths.rs`

`NotesPane` edits one free-form string per paper and debounces `api.noteSave` by one second. The backend reads/writes `<library-root>/notes/<paper-id>.md` via `LibraryPaths::note_file`.

Risks and observations:

- It is not PDF-positioned and has no independent note IDs.
- Save completion updates the saved snapshot with the request payload; ordering is not guarded by a persisted revision.
- It remains valuable user data even when removed from the default core UI.
- Conversion must preserve the original file and include it in the report/archive index.

## 2. Structured Note Sections

Anchors:

- `src/pages/reader/NoteSectionsPane.tsx`
- `src/pages/reader/noteSectionState.ts`
- `src-tauri/src/commands/notes.rs`
- `src-tauri/src/storage/note_sections.rs`
- `src-tauri/migrations/0015_note_sections.sql`

`note_sections_get` calls `ensure_defaults`, so opening the pane can create a default card set. Rows live in `paper_note_sections` with `section_key`, content, source, sort order, and timestamps. The UI supports many historical keys and debounced per-card saves.

Risks and observations:

- The fixed card taxonomy is product workflow, not a general annotation primitive.
- It mixes user and AI-generated content through the `source` field.
- Auto-created empty rows inflate apparent data and need filtering in export reports.
- User/AI source metadata and ordering must survive export to `archives/legacy-notes/<paper-id>.md`.

## 3. Highlight-Linked Notes

Anchors:

- `src/pages/reader/PdfLinkedNoteBox.tsx`
- `src/pages/reader/PdfMarginNotesOverlay.tsx`
- `src-tauri/src/commands/highlights.rs`
- `src-tauri/migrations/0001_init.sql`

An ordinary highlight can store optional text in `highlights.note`. `PdfLinkedNoteBox` renders this next to the first highlight rectangle and saves through `highlight_update_note`.

This remains part of `PdfHighlight`: selected text plus geometry, color, and optional associated explanation/note. It is distinct from a free-positioned PDF text box.

The component uses a local sequence counter to avoid stale error/loading state, but successful older requests can still reach the backend without a persisted revision contract. The new annotation controller must serialize or reject stale writes.

## 4. Standalone PDF Text Boxes Masquerading as Highlights

Anchors:

- `src/pages/reader/PdfMarginNotesOverlay.tsx`
- `src/pages/reader/pdfSelectionHelpers.ts`
- `src/pages/reader/PdfPane.tsx`
- `src-tauri/src/commands/highlights.rs`
- `src-tauri/migrations/0018_highlight_labels.sql`

A standalone text box is currently inserted into `highlights` and identified by:

```ts
export const READER_MARGIN_NOTE_LABEL = "reader-margin-note";
```

Its rectangle and `noteFontSize` are embedded in highlight position JSON. Content uses `highlights.note`; move/resize writes the highlight rect; type is inferred from `label`.

The overlay already supports drawing a box, selecting it, editing text, moving, resizing, changing font size, and deleting. This makes it the strongest user-facing base for the new note experience, but not a valid long-term data model.

Defects the target contract addresses:

- type is a magic string rather than a discriminated persisted entity;
- a text note can enter highlight search/list logic unless every caller remembers the predicate;
- style is partly embedded in geometry JSON and lacks explicit color/opacity fields;
- update ordering is not protected by a database revision;
- highlight-specific AI columns and FTS triggers apply to a different semantic object;
- geometry conversion logic is coupled to the rendering overlay.

## Target Mapping

| Current data | Target |
| --- | --- |
| ordinary highlight, including optional linked note | `PdfHighlight` in core |
| highlight with `label = reader-margin-note` | new `PdfTextNote` row in `pdf_notes` |
| `notes/<paper-id>.md` | preserve original; index in legacy archive/report; no default core editor |
| `paper_note_sections` | deterministic Markdown archive with key/order/source metadata |

## Migration Assertions

- Every legacy margin-note ID maps deterministically to one `pdf_notes` row.
- Page and rectangle coordinates render at equivalent locations at multiple zoom levels.
- Text, font size, color/default, opacity/default, timestamps, and paper ownership are retained or explicitly defaulted in the conversion report.
- Empty default note-section rows do not masquerade as authored content, but their existence is accounted for.
- Existing Markdown files are never overwritten.
- A second conversion run creates no duplicate text notes or archives.
- An injected failure restores both the database and affected archive files.

## Required Save Semantics

The target Reader controller owns per-annotation serialized mutation queues. Each persisted mutation supplies an expected revision; the backend rejects stale updates. UI debounce is only an optimization. It is not the consistency mechanism.
