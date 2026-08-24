# LitFolio Project Constraints

## Product Boundary

LitFolio is a local-first Tauri 2 desktop literature manager. Imported papers, notes, highlights, metadata, SQLite state, and generated Markdown remain on the user's machine. Core local workflows must work without AI, network access, or optional services.

## Architecture Boundaries

- Frontend: React/TypeScript under `src/`. Backend: Rust/Tauri under `src-tauri/`. Keep the Tauri IPC contract aligned across registered commands, `src/lib/api*.ts`, schemas, mocks, and parity tests.
- Keep persistence behind storage modules. Add new database changes as migrations; never rewrite a migration that may have shipped.
- Do not use `any`, unchecked JSON, or page-level `dangerouslySetInnerHTML`. Use typed parsers and the centralized Markdown rendering path.
- Keep user credentials in keyring-backed storage. Do not log secrets or private document content. Network access must be explicit, recoverable, and must not block startup.

## Release and Repository Rules

- Coordinate release version changes across `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and `src-tauri/Cargo.lock`.
- Do not commit release notes, planning notes, or generated documentation sources. Under `docs/`, only bundled manual PDFs are release artifacts.
- Preserve unrelated worktree changes and generated local data.

## Validation

Run focused tests first. Before completing a substantial change, run `pnpm typecheck`, `pnpm lint`, and `pnpm test`; run relevant Cargo tests from `src-tauri` for Rust or Tauri changes. Use `pnpm test:e2e` for affected end-to-end user flows.
