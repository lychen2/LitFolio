# Extract Source, Discovery, and Candidate Plugins - Implementation

## Entry Gate

- `mono-plugin-host-sdk` is completed and archived with passing fixture lifecycle/security tests.
- Core local import and paper capabilities are stable.

## Checklist

1. [ ] Inventory routes, commands, tables, jobs, network calls, settings, candidate state, and current tests; freeze parity fixtures and assign each legacy field to one owner.
2. [ ] Create separate canonical manifests/entrypoints for `source-connectors`, `discovery-feeds`, and local-only `candidate-inbox`, with no internal cross-import.
3. [ ] Define typed network/secret/file grants, data-transfer disclosure receipts, host-owned execution records, manual-refresh schedule eligibility, cancellation tokens, and instance-generation checks in every privileged path.
4. [ ] Extract source connector services/commands behind those grants plus jobs and core paper/import capabilities; preserve static adapters.
5. [ ] Register DOI/arXiv/search UI through `import.sources` and verify core local import remains unchanged.
6. [ ] Create separate discovery and candidate-inbox sidecar schemas/migrators for migrations `0006`, `0016`, `0022`, `0025`, `0027`, `0028`; add backup/rollback and no-cross-sidecar-access tests.
7. [ ] Extract Feed/Browse/Topic routes, alerts/settings, jobs, and clients into `discovery-feeds`; extract Candidate Inbox routes, local review/seen/deduplication state, and actions into `candidate-inbox` without network grants.
8. [ ] Implement a versioned, idempotent candidate producer/consumer capability and public import-contribution lookup; test inbox use without discovery and discovery use without source connectors.
9. [ ] Require a successful disclosed manual refresh before schedule registration; test startup silence and eligibility invalidation after endpoint, disclosure, grant, disable, or generation change.
10. [ ] Test cancellation/idempotency/generation rechecks for refresh, survey, metadata, candidate submission, and import jobs, including disable mid-flight and stale callbacks/results.
11. [ ] Run parity, execution-ledger, grant, disclosure, and lifecycle tests, then remove old static entries only when equivalent behavior passes.
12. [ ] Record final schema/data mappings for `mono-legacy-conversion` and dependency ownership for build pruning.

## Validation

```bash
pnpm typecheck
pnpm lint
pnpm test
(cd src-tauri && cargo test feeds)
(cd src-tauri && cargo test candidates)
(cd src-tauri && cargo test ingest)
pnpm test:e2e -- --grep "import|browse|feeds|topic|candidate"
python3 ./.trellis/scripts/task.py validate .trellis/tasks/07-23-mono-plugin-source-discovery
```

## Rollback Gates

- Keep old command/route adapters until each plugin passes independent parity.
- Do not switch data ownership until sidecar backup/rollback fixtures pass.
- Do not remove core local import or share a raw core pool.
- Stop if network cancellation can leave a partial core record.
- Stop if Candidate Inbox requires discovery/network code, a schedule precedes a successful manual refresh, or a revoked generation can commit or publish a result.

No automatic commit or final dependency pruning.
