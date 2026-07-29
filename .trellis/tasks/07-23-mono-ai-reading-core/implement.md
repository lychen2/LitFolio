# Move AI Reading into Mono Core - Implementation

## Entry Gate

- `mono-core-boundaries` is completed and archived.
- `mono-reader-annotations` and `mono-provenance-reading` are completed before Reader annotation/question/context integration is switched.
- Parent context-envelope, proposal, execution-record, and cancellation contracts are reviewed; implementation extends those contracts rather than defining local alternatives.

## Checklist

1. [ ] Inventory all `apiAiReader` methods and backend `TaskKind` users; classify each as core AI Reading, plugin-owned, compatibility-only, or removal candidate.
2. [ ] Add structured AI capability/error types plus host-constructed `ReadingContextEnvelope`, redacted execution-record, cancellation-token, and proposal DTO/parser/mock parity before changing UI behavior.
3. [ ] Implement one active reading-model resolver with legacy config/keyring compatibility and redacted frontend config responses.
4. [ ] Migrate TL;DR, Quick Read, paper/Markdown/selection translation, terminology, and highlight actions to the shared resolver one command group at a time.
5. [ ] Add host context construction/freeze for paper, selection, and highlight refs; validate paper ownership, accepted revision/source hashes, budgets, truncation, provenance, warnings, stale refs, and empty-scope behavior before dispatch.
6. [ ] Add `reader_ask_paper` over the frozen envelope with repository-spy tests proving no full-library retrieval, embeddings, sessions, tools, skills, or context append after approval.
7. [ ] Wrap each provider dispatch in a real cancellation token and redacted execution record; enforce exactly-once terminal state and suppress late output/persistence after cancel or Reader revocation.
8. [ ] Route AI-authored note/annotation/tag/metadata/document changes to revision/hash-bound proposals with digest, idempotency, conflict, receipt, and recovery tests; retain direct writes only for dedicated generated fields.
9. [ ] Replace `PdfSelectionAskBox` use of `libraryAsk` with the core command and integrate context approval/cancel/proposals through Reader controller boundaries.
10. [ ] Split plugin-owned retrieval/conversations/embeddings/tools/skills/batch/discovery/survey/project/graph methods out of the core API surface while retaining explicit temporary adapters for unmigrated callers.
11. [ ] Simplify core Settings to profiles plus one active reading model; preserve legacy/plugin-owned config fields for later migration.
12. [ ] Add no-profile, context-rejection, cancellation/late-result, proposal conflict/replay, execution-redaction, retry, provider-error, and no-network-before-action UI/backend tests.
13. [ ] Run focused backend/frontend tests after each action family, then full validation and Reader E2E.
14. [ ] Record compatibility adapters for plugin extraction children; verify no unrelated AI workflow was deleted and no non-agentic core boundary was widened.

## Validation

```bash
pnpm typecheck
pnpm lint
pnpm test
(cd src-tauri && cargo test profile)
(cd src-tauri && cargo test reader_translate)
(cd src-tauri && cargo test reader_ask_paper)
pnpm test:e2e -- --grep "AI Reading|reader"
python3 ./.trellis/scripts/task.py validate .trellis/tasks/07-23-mono-ai-reading-core
```

## Rollback Gates

- Preserve legacy config/keyring data before changing serialization.
- Keep old action adapters until each command, parser, mock, and UI test passes.
- Do not remove `libraryAsk` until the `library-ask` plugin owns it; only stop core Reader from calling it.
- Do not change annotation persistence in this child except through the accepted Reader proposal/apply contract.
- Do not switch a provider client until cancellation abort, terminal execution, redaction, and late-result tests pass for that client.
