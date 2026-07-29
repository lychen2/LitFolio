# Extract Knowledge Graph Plugin - Implementation

## Entry Gate

- `mono-plugin-host-sdk` is completed and archived with passing fixture lifecycle/security tests.
- Core paper, document, AI, network, event, and UI capabilities are stable.

## Checklist

1. [ ] Inventory graph/concept/link/citation/similarity UI, commands, data, AI/network calls, tests, and renderer dependencies; freeze fixtures/performance baseline.
2. [ ] Define manifest, plugin API/types/errors, contributions, and paper/document/AI/network/job capability requirements.
3. [ ] Create sidecar schema/migrator for links, citations, concepts, relations, provenance, decisions, and unresolved references.
4. [ ] Extract repositories/commands behind plugin guards and capability-resolved paper metadata; add missing-paper handling.
5. [ ] Move `/graph`, navigation, mind map/canvas, Library panels, paper actions, Reader actions, and jobs into lazy plugin contributions.
6. [ ] Extract similarity/citation network discovery and AI link/concept generation as explicit cancellable plugin jobs.
7. [ ] Preserve manual-vs-generated merge rules and add deterministic duplicate/refresh tests.
8. [ ] Implement legacy `0010`/`0017`/`0024` conversion with backup, provenance checks, idempotence, and rollback.
9. [ ] Test disable mid-job, repeated lifecycle, no-profile/network denial, missing papers, and large-graph performance.
10. [ ] Remove old static entries only after parity; mark graph-exclusive dependencies for build-pruning ownership.

## Validation

```bash
pnpm typecheck
pnpm lint
pnpm test
(cd src-tauri && cargo test graph)
(cd src-tauri && cargo test concepts)
pnpm test:e2e -- --grep "graph|concept|similar"
python3 ./.trellis/scripts/task.py validate .trellis/tasks/07-23-mono-plugin-knowledge-graph
```

## Rollback Gates

- Keep old entries until manual/generated/citation parity and performance pass.
- Do not migrate before backup/rollback and missing-paper fixtures pass.
- Stop if generic citation export becomes plugin-dependent.
- Keep renderer imports plugin-local.

No automatic commit or final bundle pruning.
