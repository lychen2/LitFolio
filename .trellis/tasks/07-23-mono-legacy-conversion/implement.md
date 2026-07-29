# Convert Legacy Library Data - Implementation

## Entry Gate

- Reader annotations, provenance reading, AI Reading, plugin host/SDK, and all plugin extraction children are completed and archived.
- Final core/plugin schemas, file layouts, config owners, migrator contracts, and canonical resolved-inclusion plan schema are frozen.

## Checklist

1. [ ] Freeze final core/plugin schema versions, owner mappings, config/file mappings, migrator interfaces, and the canonical compiler-produced resolved-inclusion schema from all preceding children.
2. [ ] Build fixture generation for every historical migration prefix `0001`-`0035` and seed boundary-specific representative data.
3. [ ] Import the host compiler's resolved-inclusion plan parser; bind the preview token to its schema/profile/manifest/owner/migrator/target digests and reject caller-built IDs or stale plans before writes.
4. [ ] Implement legacy/current/future detection, exclusive lock, read-only source open, path safety, disk preflight, and deterministic preview token.
5. [ ] Implement complete backup and manifest verification for DB/WAL/SHM/files/config/provenance plus secret-reference metadata.
6. [ ] Implement sibling staging root and durable fsynced stage journal with process-interruption recovery tests.
7. [ ] Orchestrate core baseline, annotation/note/provenance conversion, config split, plan-selected included-plugin migrators, and excluded-owner archives.
8. [ ] Preserve included-but-disabled state without activation; archive excluded-owner rows/files with reversible manifest, counts, checksums, provenance, and restore requirements.
9. [ ] Verify accepted revisions/segments, source links/snapshots/backlinks, canonical Markdown/assets, export inputs, stable IDs/references, and every owner disposition.
10. [ ] Revalidate the resolved plan immediately before switch and refuse activation on any manifest/profile/schema/migrator drift or target mismatch.
11. [ ] Implement closed-handle atomic root switch, rename failure recovery, legacy startup verification, and immutable backup retention.
12. [ ] Add failure injection at every stage and prove source byte/hash equivalence or verified usability after rollback.
13. [ ] Integrate startup detection/preview/confirmation/progress/report UI without initializing normal writable app state first.
14. [ ] Run every fixture, enabled/disabled/excluded matrix, stale-plan cases, archive restore, core-only provenance survival, second-run no-op, full Cargo/frontend tests, and upgrade E2E.
15. [ ] Persist a final mapping/report schema, including plan and provenance digests, for integration-release evidence.

## Validation

```bash
pnpm typecheck
pnpm lint
pnpm test
(cd src-tauri && cargo test legacy_conversion)
(cd src-tauri && cargo test)
pnpm test:e2e -- --grep "legacy conversion|upgrade|provenance"
python3 ./.trellis/scripts/task.py validate .trellis/tasks/07-23-mono-legacy-conversion
```

## Rollback Gates

- No conversion write before lock, disk, path, source-integrity, and backup-hash gates pass.
- No conversion write when the resolved plan is missing, caller-constructed, malformed, incompatible, or stale.
- No atomic switch before every owner and provenance verification passes and the plan is revalidated.
- No source/backup deletion in this task.
- Any schema mismatch returns to the owning child design; do not improvise owner data conversion here.

No network, AI, automatic commit, or historical migration edit.
