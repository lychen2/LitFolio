# Extract Research Workbench Plugin - Implementation

## Entry Gate

- `mono-plugin-host-sdk` is completed and archived with passing fixture lifecycle/security tests.
- Core paper, annotation, AI, file, export, and job capabilities are stable.

## Checklist

1. [ ] Inventory all project/compare/evidence/review/writing UI, commands, files, jobs, tables, and core reverse dependencies; freeze fixtures.
2. [ ] Define manifest, plugin API/types/errors, contribution set, and required paper/annotation/AI/file/job capabilities.
3. [ ] Create sidecar schema/migrator for comparisons, projects, project-paper links, evidence, writing metadata, and checkpoints.
4. [ ] Extract repositories/commands behind guards and capability-resolved paper/annotation references; add unresolved-reference behavior.
5. [ ] Extract `/projects` and `/compare`, onboarding, Library/Reader actions, exports, and job renderers into plugin contributions.
6. [ ] Route manual evidence capture and highlight-based capture through annotation capability with quote snapshots.
7. [ ] Extract AI-assisted comparison/review/writing as explicit cancellable jobs independent of Library Ask.
8. [ ] Move plugin working files and protect external exports with file scopes; test denial and interrupted writes.
9. [ ] Implement legacy `0013`/`0029`/`0030` plus writing-file conversion with backup, idempotence, and rollback.
10. [ ] Test disable during generation/export and verify retained drafts, removed UI, guarded commands, and closed handles.
11. [ ] Remove old static entries only after parity; record final schema/file mapping for legacy conversion/pruning.

## Validation

```bash
pnpm typecheck
pnpm lint
pnpm test
(cd src-tauri && cargo test projects)
(cd src-tauri && cargo test evidence)
(cd src-tauri && cargo test comparisons)
pnpm test:e2e -- --grep "project|compare|evidence"
python3 ./.trellis/scripts/task.py validate .trellis/tasks/07-23-mono-plugin-research-workbench
```

## Rollback Gates

- Keep existing routes/commands until sidecar and UI parity pass.
- Do not migrate files/data before backup/restore and missing-reference fixtures pass.
- Stop if manual workflows require AI or Library Ask.
- Preserve drafts on cancellation/disable.

No automatic commit or writing UI redesign.
