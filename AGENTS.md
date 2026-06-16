# Project Agent Instructions

## Release / GitHub Publishing Rules

1. Release version numbers must be updated together in all four files before tagging: `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and `src-tauri/Cargo.lock`.
2. The app version shown in `pnpm tauri dev` comes from the Rust/Tauri package metadata; forgetting `src-tauri/Cargo.toml` leaves the UI showing the previous version.
3. GitHub Release notes do not need to be committed as Markdown files. Keep release-note drafts local or write them directly into the GitHub Release body.
4. Do not commit `RELEASE_NOTES*.md`, release summaries, checklists, planning notes, or generated documentation sources.
5. Under `docs/`, the only files allowed in git are the bundled manual PDFs: `docs/manual/manual.pdf` and `docs/manual/manual-en.pdf`.
6. The release workflow should build signed updater artifacts in GitHub Actions using `TAURI_SIGNING_PRIVATE_KEY` and publish `latest.json`; do not do local release builds unless explicitly asked.
7. `.gitignore` only blocks newly untracked files. If a Markdown or docs file was ever tracked, remove it with `git rm --cached` or history rewrite when the remote tree/history must be clean.
