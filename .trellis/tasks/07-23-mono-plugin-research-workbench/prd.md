# Extract Research Workbench Plugin

## Goal

Move projects, evidence, paper comparison, literature review, weekly review, manifests, and project writing into an independently disableable `research-workbench` plugin.

## Dependencies

- `mono-plugin-host-sdk` is completed and archived.
- Core paper, annotation, AI, export, file, and job capabilities are stable.

## Requirements

- Own `/projects` and `/compare`, project/evidence/comparison data, writing artifacts, weekly review, literature review generation, project manifests, and related Library/Reader actions.
- Register routes, navigation, command-palette entries, paper/detail actions, Reader evidence actions, export formats, settings, and jobs only through plugin contributions.
- Store migrations `0013`, `0029`, and `0030` data plus plugin writing metadata in `plugins/research-workbench/data.db`.
- Store core paper/highlight references as stable scalar IDs and resolve them through capabilities; do not create cross-database foreign keys or open `library.db`.
- Use core AI Reading capability for explicit user-triggered generation. Do not depend on `library-ask` internals, vectors, or Ask sessions.
- Preserve project exports/manifests and user-authored writing files; external export destinations require scoped file permission.
- Cancel generation/export jobs and remove all UI/backend contributions on disable while retaining sidecar/files.
- Handle missing/deleted core paper or annotation references explicitly without deleting project/evidence records.

## Constraints

- No project onboarding/query remains in the core Shell/GlobalOnboarding when the plugin is absent.
- No automatic AI generation on startup.
- Legacy note-section UI is not revived as project storage.

## Out of Scope

- Full-library Ask/indexing, graph/concept workflows, and sync.
- A new collaborative/cloud project service.
- Broad writing-editor visual redesign.

## Acceptance Criteria

- [ ] Core-only build exposes no Projects/Compare route, onboarding step, commands, settings, or jobs.
- [ ] Enabling restores project CRUD, paper membership, evidence capture, comparisons, weekly review, literature review, writing, manifest, and export parity.
- [ ] Reader evidence actions use annotation capabilities and disappear on disable.
- [ ] Legacy project/comparison/evidence data and writing files migrate idempotently with backup/rollback and stable references.
- [ ] Missing papers/highlights are reported as unresolved references without losing user content.
- [ ] Disable during generation/export cancels work, removes contributions, closes storage, and retains drafts.
- [ ] Plugin lifecycle, frontend/backend, migration, typecheck, lint, Vitest, Cargo, and Projects/Compare E2E pass.

## Source Anchors

- `src/pages/ProjectsPage.tsx`, `src/pages/projects/`
- `src/pages/ComparePage.tsx`, `src/components/LitReviewDialog.tsx`
- `src-tauri/src/commands/projects.rs`, `evidence.rs`, `comparisons.rs`, `lit_review.rs`
- `src-tauri/src/commands/project_manifest.rs`, `project_writing.rs`, `project_writing_render.rs`
- `src-tauri/src/storage/projects.rs`, `evidence.rs`, `comparisons.rs`
- migrations `0013_comparisons.sql`, `0029_research_projects.sql`, `0030_evidence_board.sql`
