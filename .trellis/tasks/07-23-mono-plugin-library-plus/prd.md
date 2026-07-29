# Extract Library Plus Plugin

## Goal

Move optional advanced library workflows - reading queue, smart collections, custom fields, duplicate tools, and supplements - into an independently disableable `library-plus` plugin.

## Dependencies

- `mono-plugin-host-sdk` is completed and archived.
- Core paper/query/import/export/file capabilities are stable.

## Requirements

- Own queue, smart-collection definitions/results UI, custom-field definitions/values, duplicate scan/merge UI, supplement metadata/files/notes, and related settings/actions.
- Register Library toolbar/row/detail/filter contributions, settings sections, jobs, and optional actions only through plugin slots.
- Move migration `0019`, `0020`, `0021`, and `0035` data into `plugins/library-plus/data.db`; preserve stable paper references without core foreign keys.
- Evaluate smart collections through a validated core paper-query capability, not plugin-authored SQL against `library.db`.
- Run duplicate detection and merge through dedicated core paper capabilities that preview impact and preserve core transactional invariants.
- Store new supplement files in plugin-scoped storage with relative paths/checksums; migrate existing paths/files with backup and reporting.
- Expose document conversion only when a compatible `document-services` contribution is available; supplement management remains usable without it.
- Disable removes all advanced Library/settings contributions and jobs while retaining sidecar/files.
- Missing/deleted papers produce unresolved/cleanable plugin records without breaking core Library.

## Constraints

- Core retains basic paper list/search, folders, tags, read status, local import, basic export, and safe paper deletion.
- Core paper merge implementation remains core-owned even though the optional duplicate workflow invokes it.
- No direct core SQL, filesystem path escape, or hard import of document-services.

## Out of Scope

- Full-library Ask, graph, projects, feeds, sync, and MinerU implementation.
- Replacing basic core Library UX.
- Final build pruning.

## Acceptance Criteria

- [ ] Core-only Library has no queue/smart/custom-field/duplicate/supplement UI, commands, or jobs and all basic flows still work.
- [ ] Enabling restores each advanced workflow and disabling removes every contribution without losing data.
- [ ] Smart rules cannot inject SQL or access unauthorized paper fields; duplicate merge requires preview/confirmation and preserves core invariants.
- [ ] Legacy queue/smart/custom-field/supplement rows and files migrate idempotently with checksums, unresolved-reference reporting, and rollback.
- [ ] Supplements work without document-services; conversion action appears/disappears with the public contribution.
- [ ] Disable during scan/copy/conversion cancels safely and closes sidecar/file handles.
- [ ] Frontend/backend/lifecycle/migration tests, typecheck, lint, Vitest, Cargo, and Library Plus E2E pass.

## Source Anchors

- `src/pages/library/ReadingQueue.tsx`, `SmartCollectionList.tsx`, `PaperCustomFieldsSection.tsx`, `PaperSupplementsSection.tsx`
- `src/components/SmartCollectionEditor.tsx`
- `src/pages/settings/CustomFieldsManager.tsx`, `DuplicatesPanel.tsx`
- `src-tauri/src/commands/queue.rs`, `smart_collections.rs`, `custom_fields.rs`, `duplicates.rs`, `supplements.rs`
- `src-tauri/src/storage/queue.rs`, `smart_collections/`, `custom_fields.rs`, `paper_supplements.rs`, `dedup/`
- migrations `0019`, `0020`, `0021`, `0035`
