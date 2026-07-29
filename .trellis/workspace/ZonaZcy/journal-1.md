# Journal - ZonaZcy (Part 1)

> AI development session journal
> Started: 2026-07-23

---



## Session 1: Plan LitFolio Mono task tree

**Date**: 2026-07-23
**Task**: Plan LitFolio Mono task tree
**Branch**: `main`

### Summary

Created the Mono parent and 14 planning children; saved confirmed AI Reading, PDF annotation, plugin API, migration, and build decisions. Planning artifacts and contexts remain to be written.

### Main Changes

# Planning Checkpoint

## Saved state

- Created parent task `.trellis/tasks/07-23-litfolio-mono`.
- Created and linked 14 child tasks, from `mono-code-spec-foundation` through `mono-integration-release`.
- Set the parent scope to `full-stack architecture, reader, AI, plugins, storage, migration`.
- Kept the parent and every child in `planning` status.
- Kept the current Trellis session without an active task; no implementation task was started.
- Left `.trellis/tasks/00-bootstrap-guidelines` unchanged and still `in_progress`.
- Did not modify application source files or revert any existing worktree changes.

## Confirmed product decisions

- Replace the current LitFolio product in place with a Mono core; do not maintain a separate long-lived Full product.
- Core includes local library management, the PDF reader, PDF-anchored annotations, and AI Reading.
- AI Reading includes profiles, the active reading model, TL;DR, Quick Read, translation, terminology, highlight explanation, and current-paper or selected-text questions.
- Full-library RAG, embeddings, Ask sessions, topic survey, project writing, graph workflows, advanced library tools, sync, Obsidian, MinerU, and network discovery remain optional plugins.
- Replace the ineffective Markdown and ten-section note UI with a dedicated `PdfHighlight | PdfTextNote` annotation model.
- Preserve or archive every legacy note and plugin-owned data set; never silently delete user data.
- Custom plugins use a typed capability and UI-extension API, not a local TCP port.
- Phase one supports source/build-time plugin inclusion plus runtime enable/disable. Signed runtime package installation and physical uninstall are deferred.

## Remaining planning work

1. Replace the parent PRD stub with the converged requirements and acceptance criteria.
2. Add parent `design.md`, `implement.md`, and the planned source-backed research files.
3. Write `prd.md`, `design.md`, and `implement.md` for all 14 child tasks.
4. Curate real `implement.jsonl` and `check.jsonl` entries for every child.
5. Run Trellis validation and verify parent/child references and statuses.

## Resume point

Resume with todo item `编写父任务规划与研究`. Do not run `task.py start` until all planning artifacts are reviewed and the first dependency-ready child is explicitly approved.


### Git Commits

(No commits - planning session)

### Testing

- Validation was not recorded for this session.

### Status

[OK] **Completed**

### Next Steps

- None - task complete

## 2026-07-28 - Mono Core Boundaries Pause Checkpoint

### Current Task

- `.trellis/tasks/07-23-mono-core-boundaries` remains `in_progress`.
- Product source implementation is saved in the shared dirty worktree; no stash/reset/clean was used.
- No WIP source commit was created because several task-owned moves overlap pre-existing user edits in `src/main.tsx`, `src/lib/api.ts`, `src/pages/ReaderPage.tsx`, `src/pages/settings/AppUpdateCard.tsx`, and `e2e/app-smoke.spec.ts`.

### Implemented

- App providers/routes/bootstrap moved behind `src/app/` compatibility entrypoints.
- Reader route reduced to a feature assembly boundary and explicit typed core clients.
- TypeScript/Rust target-mono-v1 manifest, resource, authority, and job fixture consumers.
- Import-boundary enforcement and negative fixtures.
- Automatic startup/periodic updater removed; Settings-only compatibility owner retained.
- Frontend browser transport observers, focused Playwright request/navigation observation, and Rust host-network adapter observation.

### Latest Verification

- `pnpm typecheck` passed.
- `pnpm lint:strict` passed.
- `pnpm test` passed: 56 files, 275 tests.
- Rust focused contract/job/boot tests passed: 10 tests total.
- Trellis task validation and `git diff --check` passed; no migration changed.

### Resume

- Finish only process-wide zero-egress instrumentation: raw `reqwest`, updater transport, WebView/process/CSP, retry/schedule paths, and disabled-updates scenario.
- Then run `trellis-check`, update specs, create an explicit task-owned commit, and archive the child.
