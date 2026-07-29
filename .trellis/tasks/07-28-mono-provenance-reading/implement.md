# Provenance-Aware Core Reading Implementation Plan

## Entry Gate

- [ ] `mono-core-boundaries` and `mono-reader-annotations` are archived with required contracts/tests passing.
- [ ] Parent and child PRD/design are reviewed; V1/V1.1 scope is unchanged.
- [ ] Record the current highest migration and dirty-worktree snapshot; preserve unrelated edits.
- [ ] Validate implementation/check context manifests before starting.

## 1. Domain and Migration Foundation

- [ ] Add stable document/revision/segment/source-link/note ID and DTO/error types in the approved core domain owner.
- [ ] Add the next migration for document revisions, segments, core note identities, source links/refs, indexes, and required constraints.
- [ ] Implement repositories with one-active-revision and optimistic-revision invariants.
- [ ] Add backfill preview/report logic for `paper_documents`, `document.md`, and existing notes without rewriting source files.
- [ ] Add fixtures for empty, matching, file-only, DB-only, conflicting, and interrupted states.

**Gate:** migration/backfill tests pass; historical migrations are unchanged; rerun is idempotent; failure restores source state.

**Rollback point:** new tables are additive and compatibility reads remain unchanged.

## 2. Safe Storage and Candidate Activation

- [ ] Add the scoped atomic file replacement primitive with sync, backup, recovery intent, and failure injection.
- [ ] Implement candidate schema/size/hash/page/geometry/asset validation as one expected-`O(S)` normalization/validation pass with bounded fingerprint memory.
- [ ] Implement stage -> validate -> promote -> transaction -> finalize activation with cancellation/generation checks before commit.
- [ ] Maintain `paper_documents`/FTS and `document.md` as current compatibility projections.
- [ ] Route local PDF.js extraction through the same acceptance service.
- [ ] Expose narrow parsed core APIs and compatibility adapters; update mocks and command parity.

**Gate:** candidate failures/cancellation at every stage retain the prior active revision and restart recovery reaches one deterministic state. On the pinned 10,000-segment fixture, normalization/validation completes in `<= 200 ms` with peak memory `<= 2x` canonical payload; 100 injected file/journal failures recover to exactly old or new content with no duplicate mutation.

**Rollback point:** callers can still read the old projection while activation is disabled by a feature flag/adapter.

## 3. Source Links, Snapshots, and Remapping

- [ ] Implement source-link/link-ref CRUD with immutable snapshots and expected revisions.
- [ ] Implement indexed links-by-owner and backlinks-by-segment queries with pagination; no frontend scan fallback.
- [ ] Implement live-first/snapshot-fallback resolution and typed status/errors.
- [ ] Implement deterministic conservative remapping with exact fingerprint maps followed by bounded same/adjacent-page and semantic-kind buckets; never run all-pairs segment comparison.
- [ ] Preserve original revision/segment/snapshot fields while updating only resolved pointers/status.
- [ ] Add parser-candidate fixture tests without requiring a real network/parser plugin.

**Gate:** all resolution states, ambiguous matches, unchanged snapshots, deterministic reports, and plugin-disabled queries pass. A 1,000,000-ref/100-result backlink fixture has cold-process p95 `<= 50 ms` with one IPC/query; a 10,000-segment remap completes in `<= 500 ms`, recovers all unchanged segments, and makes zero false automatic ambiguity matches.

## 4. Revision-Safe Notes and Reader Controllers

- [ ] Add deterministic `core_notes` backfill and versioned note read/save APIs.
- [ ] Route compatibility note writes through atomic/journaled storage.
- [ ] Implement note-plus-link transaction/recovery receipts and expected-revision conflicts.
- [ ] Move save queues, latest-draft state, retries, flush, and close guards into a core note controller.
- [ ] Add bounded source preview, locate/open-source, link-status, and backlink UI to core Reader/note surfaces.
- [ ] Keep existing plain Markdown editing available; do not introduce the V1.1 rich editor/workspace shell.

**Gate:** rapid saves cannot stale-overwrite; failed save keeps the draft/surface; close/paper switch/app shutdown flushes or reports recoverable state.

**Rollback point:** existing NotesPane can remain behind the compatibility adapter until controller parity E2E passes.

## 5. Provenance Export and Degradation

- [ ] Extend baseline Markdown export with source materialization and provenance policy.
- [ ] Add changed/unresolved evidence to export reports and preserve snapshot fallback.
- [ ] Prove papers with no segments and no links export exactly as before.
- [ ] Add core-only and `document-services` disabled/excluded Reader/search/export tests.
- [ ] Verify no activation, startup, or idle path performs network work.

**Gate:** accepted evidence remains navigable/exportable with document services absent; optional plugin UI/jobs/commands are absent or rejected.

## 6. Full Validation and Review

- [ ] Run focused frontend controller/component tests.
- [ ] Run reproducible algorithm benchmarks with pinned fixture hashes, hardware/cache metadata, baseline results, and threshold assertions for normalization, backlinks, remapping, and fault recovery.
- [ ] Run focused Rust repository/service/migration/failure tests.
- [ ] Run command parity and import-boundary tests.
- [ ] Run TypeScript, lint, full Vitest, frontend build, applicable Cargo tests, and focused Reader Playwright flows.
- [ ] Compare final task-owned worktree paths with the entry snapshot.
- [ ] Capture acceptance evidence and complete the Trellis check/review flow before spec updates or commit.

## Validation Commands

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
(cd src-tauri && cargo test document_revision)
(cd src-tauri && cargo test source_link)
(cd src-tauri && cargo test note)
(cd src-tauri && cargo test)
pnpm test:e2e -- --grep "reader|provenance|document-services"
python3 ./.trellis/scripts/task.py validate .trellis/tasks/07-28-mono-provenance-reading
```

Filter names may be refined after implementation establishes exact test modules. The final child gate still runs all applicable project checks.

## Review Gates

- **Authority:** no plugin receives a raw pool/path/secret/generic invoke, and candidate owner strings never authorize access.
- **Atomicity:** no injected failure or cancellation exposes a partially accepted revision or note/link mutation.
- **Preservation:** old files, annotation geometry, note sections, and superseded evidence remain recoverable.
- **Degradation:** core Reader/notes/search/export remain functional without document services and without network.
- **Scope:** no Reflow workspace, rich-editor migration, semantic retrieval, parser provider, or broad visual redesign enters this child.
- **Worktree:** no unrelated modified/untracked file is reset, overwritten, or committed.
- **Efficiency:** an algorithm benchmark regression blocks activation or keeps the compatibility implementation; it cannot be waived by reducing atomicity, provenance, or lifecycle checks.
