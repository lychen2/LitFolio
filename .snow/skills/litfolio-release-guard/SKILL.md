---
name: litfolio-release-guard
description: Check LitFolio release/version work for synchronized metadata, updater constraints, generated documentation rules, and safe verification commands.
allowed-tools:
---

# LitFolio Release Guard

## Instructions
Use this skill for version bumps, release preparation, updater configuration, GitHub release work, and packaging changes.

1. Confirm the version is synchronized across all required files:
   - `package.json`
   - `src-tauri/tauri.conf.json`
   - `src-tauri/Cargo.toml`
   - `src-tauri/Cargo.lock`
2. Do not create committed release-note Markdown files unless the user explicitly asks.
3. Keep generated release summaries/checklists/planning notes out of git.
4. Under `docs/`, only bundled manual PDFs should be committed: `docs/manual/manual.pdf` and `docs/manual/manual-en.pdf`.
5. Prefer GitHub Actions for signed updater artifacts using `TAURI_SIGNING_PRIVATE_KEY`; avoid local release builds unless explicitly requested.
6. Review `src-tauri/tauri.conf.json` updater settings and resource bundling when touching release configuration.
7. Recommended verification:
   - `pnpm typecheck`
   - `pnpm lint`
   - `pnpm test`
   - `pnpm build`
   - `cargo test` from `src-tauri` when Rust metadata/backend changed

## Handoff Format
- Version files changed.
- Verification commands and results.
- Release artifacts generated or explicitly not generated.
- Known follow-up steps for GitHub release/updater publication.
