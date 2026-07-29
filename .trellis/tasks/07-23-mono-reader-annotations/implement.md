# Rebuild Reader PDF Annotations - Implementation

## Entry Gate

- `mono-core-boundaries` is completed and archived.
- Parent Reader annotation and rollback contracts remain approved and unchanged.

## Checklist

1. [ ] Snapshot touched Reader/storage files and add failing domain/parser tests for `PdfHighlight | PdfTextNote`.
2. [ ] Add the new `pdf_notes` migration, Rust model/repository, validation, indexes/search, and compare-and-swap revision tests.
3. [ ] Add typed Tauri commands, frontend client/parsers, mocks, and command-parity entries; run cross-layer tests.
4. [ ] Implement the per-annotation Reader controller with serialized/coalesced writes, conflict recovery, retry, and close/flush tests.
5. [ ] Adapt the PDF overlay to explicit text-note props and page coordinates; preserve current linked-highlight note behavior.
6. [ ] Add style controls and complete create/edit/move/resize/delete/search behavior with accessibility/component tests.
7. [ ] Implement an idempotent targeted legacy converter for margin-note sentinel rows and deterministic note-file/section archive export.
8. [ ] Rollback gate: run backup, injected-failure, restore, and second-run tests before disabling sentinel writes.
9. [ ] Switch new text-note creation/updates to `pdf_notes`; keep legacy reads only for unconverted libraries until the final converter owns startup orchestration.
10. [ ] Retain the default Markdown note pane and compatibility note commands/files until `mono-provenance-reading` delivers the revision-safe note controller, source-link workflow, close/flush parity, and migration evidence. That child, not annotation extraction, owns any default-pane replacement.
11. [ ] Run focused and full validation, then inspect diffs for no AI/plugin/visual redesign scope creep.

## Validation

```bash
pnpm typecheck
pnpm lint
pnpm test
(cd src-tauri && cargo test pdf_note)
(cd src-tauri && cargo test legacy_reader_note)
pnpm test:e2e -- --grep "annotation|reader"
python3 ./.trellis/scripts/task.py validate .trellis/tasks/07-23-mono-reader-annotations
```

Use actual test names introduced by implementation if Cargo filters differ.

## Rollback Gates

- Do not switch writes until CRUD, revisions, parsers, mocks, and controller tests pass.
- Do not convert a real library until a verified backup exists and fixture restoration passes.
- Do not remove sentinel reads until the final legacy-conversion task proves full upgrade coverage.
- Do not remove legacy note commands/files; archive/export behavior must remain available for conversion.

No automatic commit and no unrelated Reader styling rewrite.
