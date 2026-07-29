# Extract Library Ask Plugin - Implementation

## Entry Gate

- `mono-plugin-host-sdk` is completed and archived with passing fixture lifecycle/security tests.
- Core AI Reading, `mono-provenance-reading`, and core paper/document keyword-search capability contracts are stable.

## Checklist

1. [ ] Inventory Ask UI, commands, types, retrieval/indexing paths, sessions, vectors, and fixtures; freeze current parity expectations.
2. [ ] Define the canonical `library-ask` manifest, plugin-scoped API/types/errors, routes/actions/settings, typed grants, and live-instance-bound capability requests.
3. [ ] Add host-mediated core keyword-search/document-read methods plus explicit library-scope approval/freeze; reject empty, unauthorized, historical-union, stale, or post-freeze appended refs without exposing repositories.
4. [ ] Define parser/mock parity for `keyword|semantic|hybrid`, requested/effective mode, strict/fallback policy, degradation reasons, index revision, warnings, and pending counts.
5. [ ] Create the sidecar schema/migrator for revisioned conversations/messages/versioned parts, typed runs, proposals/references, complete embedding provenance, checkpoints, and plugin vector paths.
6. [ ] Extract core-keyword fallback, bounded Top-K semantic candidate retrieval, expected-`O(K)` deterministic RRF, revision-aware changed-chunk embedding invalidation, answering, and typed session services behind capability/instance-generation guards. Keep the vector candidate backend replaceable and separately benchmarked.
7. [ ] Wrap indexing, embedding, retrieval, answering, and optional tool work in host-owned execution records and real cancellation tokens propagated to underlying I/O; enforce one terminal state and late-result suppression.
8. [ ] Route all user-content/project/artifact mutations through host proposals with base revision/hash, evidence, digest, idempotency receipt, conflict, and recovery-journal tests.
9. [ ] Move `/ask`, scope approval, composer/workflow/source/degradation UI, typed run status, and jobs into plugin contributions; retain static adapters until parity passes.
10. [ ] Add explicit index/embedding actions, cancellation/checkpoint behavior, no-profile/empty-index states, and optional bounded typed tools with host budgets and proposal-only effects.
11. [ ] Implement legacy embeddings/session/vector conversion into provenance-complete vectors and typed parts with checksums, incompatible archive, idempotence, and injected-failure rollback.
12. [ ] Test with Research Workbench absent and verify opaque project references and proposal records remain readable/recoverable.
13. [ ] Disable mid-index/answer/tool call and verify generation revocation, underlying I/O cancellation/drain, exactly-one terminal execution, late-result denial, contribution removal, handle close, and retained resume state; startup marks orphaned work `interrupted` without resuming it.
14. [ ] Benchmark RRF, changed-only embedding work, vector backend recall/build/update/memory/cold-warm latency, and disclosed fallback on pinned corpus fixtures. Record the supported corpus ceiling; do not inherit NeuInk latency assumptions.
15. [ ] Run full checks, remove proven old static entries, and record schema/dependency ownership for final conversion/pruning while core-only keyword search and Reader AI remain green.

## Validation

```bash
pnpm typecheck
pnpm lint
pnpm test
(cd src-tauri && cargo test ask)
(cd src-tauri && cargo test embedding)
pnpm test:e2e -- --grep "Ask|library-ask"
python3 ./.trellis/scripts/task.py validate .trellis/tasks/07-23-mono-plugin-library-ask
```

## Rollback Gates

- Do not switch retrieval until capability scope tests pass.
- Do not move vectors/sessions until typed-part/provenance validation, backup, checksum, rollback, and second-run tests pass.
- Keep old Ask entrypoints until plugin route/command/session parity passes.
- Never make core Reader AI depend on plugin state.
- Do not enable semantic/hybrid results until requested/effective mode, stale-vector exclusion, disclosed keyword degradation, RRF `K <= 100` fusion `<= 2 ms`, zero unchanged-chunk embedding calls, and selected vector-backend recall/latency/memory gates pass.
- Do not accept a lifecycle implementation whose cancellation only changes job status; underlying mock I/O must observe abort and late completion must be denied.

No automatic commit or cloud RAG scope.
