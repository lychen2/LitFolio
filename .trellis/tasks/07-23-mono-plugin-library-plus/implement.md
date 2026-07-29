# Extract Library Plus Plugin - Implementation

## Entry Gate

- `mono-plugin-host-sdk` is completed and archived with passing fixture lifecycle/security tests.
- Core paper/query/merge/import/export/file capabilities are stable.

## Checklist

1. [ ] Inventory optional Library/settings UI, commands, tables, file paths, duplicate invariants, smart-rule format, and fixtures.
2. [ ] Define manifest, plugin API/types/errors, contributions, and paper/query/file/job/event capability requirements.
3. [ ] Add validated SmartRule AST and core paper-query capability with injection/field/operator tests.
4. [ ] Add core duplicate preview token/merge capability preserving transactions and emit a paper-merged event; freeze merge parity tests.
5. [ ] Create sidecar schema/migrator for queue, smart collections, custom fields, supplements, and checkpoints.
6. [ ] Extract repositories/commands and Library/settings contributions behind guards; retain static adapters until parity.
7. [ ] Move supplement files to scoped relative storage with atomic copy/checksum/path-safety tests.
8. [ ] Integrate optional document conversion through public contribution/capability and test service absent/disabled.
9. [ ] Implement `0019`/`0020`/`0021`/`0035` data/file conversion with backup, unresolved references, idempotence, and rollback.
10. [ ] Test disable during scans/copies/conversion and repeated lifecycle cleanup.
11. [ ] Run full checks, remove proven static entries, and record final data/dependency ownership for conversion/pruning.

## Validation

```bash
pnpm typecheck
pnpm lint
pnpm test
(cd src-tauri && cargo test smart_collections)
(cd src-tauri && cargo test dedup)
(cd src-tauri && cargo test supplement)
pnpm test:e2e -- --grep "queue|smart collection|custom field|duplicate|supplement"
python3 ./.trellis/scripts/task.py validate .trellis/tasks/07-23-mono-plugin-library-plus
```

## Rollback Gates

- Do not expose smart queries until AST/injection tests pass.
- Do not switch duplicate merge until preview/conflict/core transaction tests pass.
- Do not move files/data until checksum/backup/restore fixtures pass.
- Keep supplement management independent of document-services.

No automatic commit or core Library redesign.
