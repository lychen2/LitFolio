# Storage and Migrations

## Purpose

Define current SQLx SQLite, repository, filesystem path, migration, and test conventions.

## Current Rules

- `src-tauri/src/storage/db.rs` owns pool creation and the compiled SQLx migrator. File-backed pools enable foreign keys, WAL journal mode, normal synchronous mode, and at most eight connections.
- `src-tauri/src/startup.rs` resolves the default root, calls `LibraryPaths::ensure()`, opens `library.db`, runs SQLx migrations, and then runs recoverable startup maintenance. A migration failure aborts bootstrap; optional maintenance logs a warning and continues.
- Historical migrations `src-tauri/migrations/0001_init.sql` through `0035_paper_supplements.sql` are immutable. SQLx records applied migration identity/checksums, and changing shipped history can make existing libraries fail. Add the next ordered migration for every schema change.
- Keep repository SQL and row conversion under `src-tauri/src/storage/` near the owned model. Commands call repositories instead of duplicating SQL.
- `LibraryPaths` in `src-tauri/src/storage/paths.rs` is the canonical current filesystem owner. It resolves `library.db`, `papers/`, `notes/`, `vectors/`, `attachments/`, `backups/`, `logs/`, `litera.config.json`, per-paper `document.md`, translated Markdown caches, and legacy `text.txt` compatibility.
- Use the path helper matching the trust boundary. `ensure_inside_root` canonicalizes an existing managed path and rejects root escape. `validate_external_pdf` validates an external regular file, `.pdf` extension, `%PDF-` signature, and rejects self-import from inside the library.
- Preserve user data across migrations and filesystem conversion. Multi-row or database/file changes need a transaction or staged/verified replacement appropriate to the boundary; do not report success after only one side commits.
- Repository tests create isolated temporary or in-memory databases, run the real migrator, exercise CRUD/constraints/error cases, close resources where needed, and remove temporary directories.

## Source Examples

- `src-tauri/src/storage/db.rs`: `open_pool`, `MIGRATOR`, migration application, latest-schema assertions, idempotent rerun, and old-`0001` upgrade coverage.
- `src-tauri/src/startup.rs`: bootstrap ordering and optional startup task failure isolation.
- `src-tauri/src/storage/paths.rs`: directory layout, canonicalization, PDF signature checks, cache compatibility, and path-focused unit tests.
- `src-tauri/migrations/0001_init.sql`: papers, taxonomy, highlights, `ai_jobs`, and initial FTS.
- `src-tauri/migrations/0014_fts_extend.sql`: rebuilding FTS plus triggers for papers, highlights, and terms.
- `src-tauri/migrations/0031_paper_documents.sql` through `0035_paper_supplements.sql`: current document index state, generic `jobs`, Ask sessions, and supplements.
- `src-tauri/tests/fixtures/old_0001_library.sql`: upgrade fixture whose paper, highlight, tag, folder, and FTS behavior must survive.

The current schema has both legacy `ai_jobs` from `0001` and generic `jobs` from `0033`. Neither implements the planned owner/generation/event/cancellation envelope in [Canonical Target Mono Contracts](../cross-layer/mono-contracts.md).

## Validation

```bash
cargo test --manifest-path src-tauri/Cargo.toml storage::db::tests
cargo test --manifest-path src-tauri/Cargo.toml storage::paths::tests
cargo test --manifest-path src-tauri/Cargo.toml storage::papers::tests
cargo test --manifest-path src-tauri/Cargo.toml storage::highlights::tests
```

Before and after migration work, record the historical migration hashes without editing them:

```bash
sha256sum src-tauri/migrations/*.sql
```

## Anti-Patterns

- Editing, renaming, reordering, or deleting migrations `0001` through `0035`.
- Constructing a managed paper path in a command and skipping `LibraryPaths` safety checks.
- Treating `plugins/<id>/data.db` as current storage; it is planned. (`pdf_notes` from migration `0036` is current storage owned by `src-tauri/src/storage/pdf_notes.rs`.)
- Using ad hoc SQL in page-facing commands when an owning repository exists.
- Deleting a legacy file/table before backup, conversion verification, and restore behavior exist.

## Related Specs

- [Backend Index](./index.md)
- [Tauri Commands](./tauri-commands.md)
- [Error Handling](./error-handling.md)
- [Reader Annotations](../cross-layer/reader-annotations.md)
- [Canonical Target Mono Contracts](../cross-layer/mono-contracts.md)
