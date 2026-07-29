# Extract Update, Sync, and Document Integration Plugins - Implementation

## Entry Gate

- `mono-plugin-host-sdk` is completed and archived with passing fixture lifecycle/security tests.
- Core snapshot, file, secrets, network, jobs, export, accepted-document, and document Markdown contracts are stable.

## Checklist

1. [ ] Inventory updater, sync, Obsidian, MinerU, conversion UI, commands, config/secrets, files, jobs, dependencies, and security tests; freeze parity fixtures and assign each legacy field to one owner.
2. [ ] Define canonical manifests/entrypoints for `updates`, `sync-integrations`, and `document-services`; generate and verify matching frontend, Rust runtime, mock, and build registries.
3. [ ] Implement opaque instance bindings plus typed network/secret/file grants, host-owned redacted execution records, data-transfer disclosure receipts, manual-action schedule eligibility, cancellation tokens, and generation checks for every privileged operation.
4. [ ] Extract updater checks/download state and settings into `updates`; prove core startup has no updater network call and schedules require a successful disclosed manual check.
5. [ ] Implement host-owned versioned snapshot create/preview/apply/restore with opaque handles and plugin export/import hooks.
6. [ ] Add conflict tokens, complete backup, atomic apply, absent-plugin archive, injected-failure restore, cancellation, generation, and manual-before-schedule tests.
7. [ ] Extract WebDAV config/test/preview/push/pull and UI/jobs behind typed network/secret/snapshot grants and disclosure checks.
8. [ ] Implement document conversion/export contributions and extract Obsidian, MinerU, and optional conversion flows behind typed file/network/secret/job grants.
9. [ ] Implement parser candidate stage/validate/explicit-accept: keep raw artifacts in document-services staging, validate source hash/schema/geometry/assets/order in core, and atomically accept only approved candidates into core-owned revisions/segments/Markdown/FTS.
10. [ ] Preserve core PDFJS/document Markdown/basic export and prove source links/snapshots/backlinks, Reader navigation, notes, keyword search, and baseline export survive `document-services` disable or exclusion.
11. [ ] Migrate mixed legacy config fields/secrets with round-trip/unknown-field/idempotence tests.
12. [ ] Register Library Plus conversion through public contributions and test every integration plugin independently disabled.
13. [ ] Test disable mid-transfer/conversion/update, staged cleanup, handle revocation, execution records, retained checkpoints/config, and stale callback/result rejection.
14. [ ] Remove old static settings/commands only after parity/security tests; record dependencies for build pruning.

## Validation

```bash
pnpm typecheck
pnpm lint
pnpm test
(cd src-tauri && cargo test library_sync)
(cd src-tauri && cargo test mineru)
pnpm test:e2e -- --grep "update|sync|Obsidian|document service"
python3 ./.trellis/scripts/task.py validate .trellis/tasks/07-23-mono-plugin-integrations
```

## Rollback Gates

- Do not enable updater schedules or a startup updater check; updater networking remains owned by the `updates` plugin and requires a successful disclosed manual check.
- Do not apply a remote snapshot before preview-token, backup, conflict, and restore tests pass.
- Do not migrate config/secrets before legacy round-trip/redaction tests pass.
- Do not replace core PDF extraction or permit `document-services` to write `library.db`, core FTS, or canonical document state.
- Stop if disabling document services loses accepted evidence, Reader/navigation, notes, keyword search, or baseline export.
- Keep old adapters until each plugin passes independent parity.

No automatic commit, hosted sync, or final dependency pruning.
