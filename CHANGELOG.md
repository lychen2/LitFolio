# Changelog

## v0.3.11

### Architecture & Code Health

- **Command registration refactored into a layered macro chain.** The 150+ entry `tauri::generate_handler![]` in `lib.rs` is replaced with domain-layered macros (`core → papers → library_taxonomy → imports_pdf → config_sync_ai → projects_research → reader_notes → feeds_discovery_graph → collections_data`), dramatically improving maintainability and testability.
- **Centralized test mocks.** Extracted `src/test/tauriMockCommands.ts` as the single source of truth for Tauri command mock data. `pageSmoke.test.tsx` and `tauriCoreMock.ts` no longer maintain scattered switch/default-null branches. Unknown commands now throw with a registered command list in the error message.
- **Frontend command registration parity test.** Added `src/lib/tauriCommandParity.test.ts` that verifies every frontend API call matches a command registered in `commands/mod.rs`, preventing silent drift.

### Data Integrity & Safety

- **Streamed PDF import with 200 MiB hard cap.** `import_pdf_file` now uses `BufReader`/`BufWriter` for streamed copy with in-flight SHA-256 hashing. Added `reject_oversized_pdf` to reject files over 200 MiB before any copy begins.
- **Semantic Scholar rate limiter race condition fixed.** `ingest/search.rs` replaces the `AtomicU64 + Relaxed` two-variable scheme with a `Mutex<RateLimitState>`, eliminating the race between window reset and counter increment.
- **Topic discovery now sequential.** `discover_topic_multi` in `ingest/topic.rs` changed from concurrent to sequential execution, staying conservative with the now-properly-rate-limited Semantic Scholar API.
- **Sync pull atomic replacement with rollback.** `replace_library_root` changed from "clear directory + full copy" to a three-phase atomic swap: copy snapshot to staging dir, backup existing library to `backups/pre-pull-backup-{ulid}`, then rename staging → target. Original data is preserved on failure. Backed by rollback-protection tests.
- **PDF body index status tracking.** Added `index_status`, `index_error`, `indexed_at` columns to `paper_documents`. `upsert_markdown` auto-marks as `indexed`; new `mark_index_failed` records error details when PDF parsing fails. Frontend can query indexing progress via `index_status_for_papers`.

### Features & UX

- **Project page enhancements** (`ProjectsPage`)
  - Added **Export Markdown Package** button — one-click copy of the full research package (background, papers, evidence) as Markdown to clipboard.
  - Added **Delete Project** button — delete directly from the sidebar. Auto-selects adjacent project after deletion.
  - `onSelect` callback signature changed to accept `number | null`, supporting deselection.
- **Frontend API Schema runtime validation expanded.** Added `parseCandidatePaper`, `parseResearchProject`, `parseEvidenceItem`, `parseTopicAlertResult`, `parseSyncReport` parsers, covering cross-boundary DTOs that previously relied on TypeScript types alone. 10 new validation tests added.
- **Sync API return values now parsed.** `syncApi.pushLibrary()` and `pullLibrary()` changed from bare `invoke<T>` to `invokeParsed` + `parseSyncReport`, preventing silent failures when backend return format changes.

### Testing & Quality

- **E2E browser prereq check.** `test:e2e` script now runs `node scripts/check-playwright-browsers.mjs` before Playwright, detecting missing browser binaries with a clear message.
- **PDF index status test.** New `paper_document_index_status_tracks_success_and_failure` test in `storage/papers/tests.rs` covering the full lifecycle of indexed and failed states.
- **Sync pull safety tests.** Two new tests in `library_sync/local/tests.rs`: rollback on snapshot copy failure, and pre-pull backup verification on success.
- **Database migration test updated.** Migration test in `storage/db.rs` now asserts new `paper_documents` columns.

### Cleanup

- Removed stale planning docs: `docs/REFACTOR-PLAN.md`, `docs/ROADMAP.md`, `docs/STATUS-2026-05-24.md`, `docs/STATUS-2026-05-25.md`, `docs/plans/2026-05-24-notemd-batch1-plan.md`, `docs/plans/2026-05-25-notemd-inspired-batch1-design.md`.
- Code formatting — function signatures and conditionals wrapped to stay within 100 columns.
