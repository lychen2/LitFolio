# Implementation Evidence

## Reconciliation Snapshot

Evidence reconciled against the dirty shared worktree on 2026-07-28. User-owned edits outside this task (theme-token churn across `src/pages/reader/*`, AI/provenance files, navigation/theme work) were preserved; `git diff --name-only -- src-tauri/migrations` shows only the new `0036_pdf_notes.sql` (untracked) and no modified shipped migration.

## Implemented Surfaces

- **Model**: `ReaderAnnotation = PdfHighlight | PdfTextNote` discriminated union in `src/core/contracts/readerAnnotations.ts` with geometry/style validation shared by parser and backend (`isValidPdfAnnotationRect`, `isValidPdfTextNoteStyle`); domain tests in `readerAnnotations.test.ts`.
- **Persistence**: `src-tauri/migrations/0036_pdf_notes.sql` — `pdf_notes` table with paper/page and updated-at indexes, `legacy_highlight_id` UNIQUE link for converter idempotence, FTS5 search table with insert/delete/update triggers. Rust model/repository in `src-tauri/src/storage/pdf_notes.rs`: `PdfNoteRepo` with `create`/`list_by_paper`/`get`/`update`/`delete`/`search`, atomic `WHERE id = ? AND revision = ?` compare-and-swap, `annotation_revision_conflict` carrying the current note, `paper_not_found`, `annotation_invalid_geometry`, `annotation_invalid_style`, `annotation_not_found`.
- **IPC**: `pdf_note_create/list/update/delete/search` in `src-tauri/src/commands/pdf_notes.rs` plus `legacy_reader_notes_preview/export` in `src-tauri/src/commands/legacy_reader_notes.rs`, all registered in `commands/mod.rs`. Frontend typed client methods in `src/core/data/readerClient.ts`, handwritten parsers in `src/lib/apiSchemaReader.ts` (`parsePdfTextNote`, `parsePdfTextNoteSearchResult`, `parseLegacyReaderNotesPreview`, `parseLegacyReaderNotesReport`), mocks in `src/test/tauriMockCommands.ts`; command parity and the resolver map remain green.
- **Controller**: `src/features/reader/annotationController.ts` — per-annotation mutation queue, debounce, coalesced compatible patches, monotonic revisions, `annotation_revision_conflict` recovery with bounded retries, unmount/close flush, paper-switch epoch cancellation, and saved-state only after persistence resolves (status-timing bug fixed by clearing `inFlight` before resolving waiters). Fake-timer tests in `annotationController.test.ts`.
- **Overlay**: `PdfMarginNotesOverlay` and `PdfPane` adapted to explicit `PdfTextNote` props and page coordinates (unscaled PDF space; zoom derived only in renderer). New text-note creation/updates flow through the controller to `pdf_note_*`; the `reader-margin-note` label is no longer used for new writes (`isReaderMarginNote` remains only as a legacy-read helper). Ordinary highlight + highlight-linked note behavior (`PdfLinkedNoteBox`) unchanged.
- **Legacy converter**: `src-tauri/src/storage/legacy_reader_notes.rs` — `preview_legacy_reader_notes` and `export_legacy_reader_notes` (plus a test-only staged variant with `LegacyExportStage` failure injection). Deterministic target ids (`legacy-<highlight-id>`), UNIQUE-linked already-converted reporting, never deletes originals, accepts both react-pdf-highlighter (`x1/y1/x2/y2/pageNumber`) and explicit rect JSON, defaults styles with counted `defaultedStyles`. Archive export writes a deterministic `index.json` + sorted per-paper `notes/*.md` and `sections/*.json` (key/order/source/content) through a staging dir renamed into place; timestamps appear only in the backup directory name; the verified backup manifest captures sentinel rows, note files, and sections before conversion. On injected archive failure the staging dir is removed, converted rows are rolled back (`rollback_state: "rolled-back"`), and a clean second run converts them.

## Test Evidence

```bash
pnpm typecheck            # clean
pnpm lint:strict          # clean (0 warnings)
pnpm test                 # 59 test files, 290 tests passed
(cd src-tauri && cargo test pdf_note)              # 5 passed
(cd src-tauri && cargo test legacy_reader_notes)   # 5 passed
cargo test (full)         # 338 passed, 1 ignored
pnpm exec playwright test e2e/app-smoke.spec.ts --grep "annotation|reader"  # 2 passed
python3 ./.trellis/scripts/task.py validate .trellis/tasks/07-23-mono-reader-annotations  # passed
git diff --check          # clean
git diff --name-only -- src-tauri/migrations       # only untracked 0036_pdf_notes.sql
```

Legacy converter fixtures cover: preview counts before/after conversion, deterministic archive contents (no wall-clock timestamps), idempotent second run with already-converted reporting, injected archive failure restoring staged files and rolling back rows, destination-is-a-file rejection, and invalid-geometry rows counted failed without conversion.

## Remaining Adapters and Removal Owners

| Adapter | Current purpose | Removal owner |
| --- | --- | --- |
| Default Markdown note pane + `note_get`/`note_save` | Keep compatibility note files working | `mono-provenance-reading` delivers the revision-safe note controller and source-link workflow before any default-pane replacement |
| Note-section commands/files | Structured sections still used by the note panes | `mono-provenance-reading` (close/flush parity) with `mono-legacy-conversion` for conversion orchestration |
| `isReaderMarginNote` sentinel read helper | Read-only legacy input for the converter | `mono-legacy-conversion` after whole-library conversion proves full upgrade coverage |
| `legacy_reader_notes_preview/export` commands | Explicit user-triggered conversion primitives | `mono-legacy-conversion` orchestrates startup conversion; primitives stay as the per-library engine |
| `src/features/reader/ReaderAssembly.tsx` composition | Reader assembly surface | composition callers migrate in later Reader work |

## Scope Guard

Diff review found no AI behavior change, no plugin extraction, no migration 0001-0035 modification, no note-file deletion, and no broad visual redesign. The `startup_network_process` suite (archived boundary task) was intentionally not re-run.
