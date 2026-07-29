# Extract Library Ask Plugin

## Goal

Move full-library retrieval, embeddings, semantic/hybrid ranking, vector storage, typed Ask conversations/runs, and the `/ask` workflow into an independently disableable `library-ask` plugin.

## Dependencies

- `mono-plugin-host-sdk` is completed and archived.
- Core AI Reading, `mono-provenance-reading`, and core paper/document keyword-search capabilities are stable.

## Requirements

- Own full-library question answering, retrieval/index state, embeddings, vector files, conversation history, pinned papers, Ask sessions, and Ask-specific export/save actions.
- Keep current-paper and selected-text questions in core AI Reading; the plugin must not replace or intercept them.
- Entering full-library retrieval from Reader/current-paper scope requires an explicit, user-visible scope transition. The host resolves approved refs into a frozen context envelope with authorized paper IDs, accepted source hashes/revisions, budgets, truncation, provenance, and warnings before plugin dispatch; the plugin cannot append resources after approval.
- Support explicit `keyword`, `semantic`, and `hybrid` retrieval requests. Core owns keyword search; the plugin owns embeddings and semantic/hybrid ranking. Default degradation is disclosed keyword fallback, while a strict request returns a structured error rather than silently changing mode.
- Register `/ask`, navigation, command-palette, settings/status, jobs, and optional paper/library actions only through plugin contributions.
- Store embeddings and Ask sessions in `plugins/library-ask/data.db` and plugin-scoped files; use core paper/document capabilities instead of opening `library.db`.
- Persist conversations as revision-safe typed messages and versioned parts for text, frozen context, sources, tool calls/results, proposals, run state, memory, and structured errors. Persist typed runs with budgets, model reference, job/execution/context IDs, stop reason, and terminal status; do not retain whole-session unvalidated JSON as the canonical format.
- Store embedding provenance sufficient for deterministic invalidation: paper/document ID, source hash/revision, chunk ID and chunker ID/version, embedding provider/model/revision, dimensions, vector format, and creation time. Re-embed only changed/stale chunks; unchanged provenance must produce zero provider calls.
- Fuse bounded keyword and semantic Top-K lists with deterministic reciprocal-rank fusion in expected `O(K)` time. NeuInk's vector scan is not prescribed: exact, ANN, or layered candidate backends must independently pass the declared corpus-scale benchmark and recall gate.
- Convert legacy migration `0023` embeddings, migration `0034` Ask sessions, and compatible `vectors/` content without data loss.
- Preserve opaque project references in sessions even when Research Workbench is absent; do not create cross-sidecar foreign keys.
- Attribute indexing, embedding, retrieval, answer, and optional bounded tool jobs to the live plugin instance. Use host-owned persisted execution records and real cancellation tokens propagated to provider/tool I/O; disable revokes generation first, cancels and bounded-drains work, and blocks late results or writes.
- Any Ask/tool output that would change user-authored notes, annotations, tags, metadata, accepted documents, projects, or saved artifacts must create a host-owned revision/hash-bound proposal. The plugin cannot directly apply user-content mutations.
- Provide structured capability/index/profile states and recoverable local-search fallback where currently supported.
- Disable removes all Ask UI/commands/jobs and closes vector/storage handles while retaining data.

## Constraints

- No core startup dependency on vectors, embeddings, index health, or Ask sessions.
- No direct import of Research Workbench internals or plugin-to-plugin database access.
- Core `paper_documents`, accepted document provenance, document FTS, and keyword search remain core-owned; the plugin consumes bounded capability results.
- No plugin-owned keyword index may replace the core keyword baseline. No empty/current-paper scope may implicitly expand to the library or historical conversation scope.
- Optional tools/skills remain bounded, typed, declarative plugin behavior; they do not turn core AI Reading into an agent and receive no process, shell, raw path/database, generic invoke, or direct-write authority.
- Do not claim large-corpus semantic latency from RRF alone. The vector candidate backend, index build/update cost, memory, recall, cold/warm latency, and supported corpus ceiling require separate benchmark evidence.

## Out of Scope

- Current-paper Reader question behavior.
- Project writing/evidence and graph workflows.
- A hosted/cloud RAG service or automatic background upload.
- Agent/tool loops in core AI Reading or unrestricted executable skills.

## Acceptance Criteria

- [ ] Core-only startup and Reader/library flows never open Ask/vector storage or expose `/ask`.
- [ ] Enabling the plugin restores Ask route, retrieval, pinned papers, sessions, index/capability status, and existing tested answer behavior.
- [ ] Retrieval tests prove sources come only from authorized core paper/document capability results.
- [ ] Scope-transition tests prove current-paper scope stays core, library scope is explicitly approved and frozen before dispatch, and empty, unauthorized, historical-union, or post-freeze appended refs are rejected.
- [ ] Keyword/semantic/hybrid tests report requested/effective mode, index revision, warnings, pending count, and structured degradation; stale/partial/failed embeddings never masquerade as current semantic results.
- [ ] Embedding fixtures invalidate on every recorded source, chunker, model, revision, dimension, and vector-format mismatch.
- [ ] Algorithm benchmarks prove RRF fusion of two `K <= 100` lists in `<= 2 ms`, unchanged chunks trigger zero embedding calls, and the selected vector backend meets a pinned recall/latency/memory gate for its advertised corpus size without startup work.
- [ ] Legacy embeddings/sessions/vector files migrate idempotently with count/checksum evidence and rollback.
- [ ] Typed conversation/message-part/run persistence uses expected revisions, keeps terminal messages immutable, and marks orphaned running work `interrupted` without resuming network/tool work on startup.
- [ ] Disable during indexing, answering, or a tool call aborts underlying work, emits exactly one terminal execution state, removes contributions, closes files/DB, rejects late completion, and retains resumable state.
- [ ] Mutation attempts create reviewable proposals with base revision/hash, digest, idempotency receipt, conflict result, and no direct user-content write.
- [ ] No profile/index/plugin-disabled states are structured and do not affect core AI Reading.
- [ ] Frontend/backend/plugin lifecycle tests, typecheck, lint, Vitest, Cargo tests, and Ask E2E pass.

## Source Anchors

- `src/pages/AskPage.tsx`, `src/pages/ask/`
- `src/lib/apiKnowledge.ts`, current Ask types/parsers in `src/lib/apiAiReader.ts` and `apiSchema.ts`
- `src-tauri/src/commands/ask.rs`, `commands/ask/`
- `src-tauri/src/storage/embeddings.rs`, `paper_documents.rs`
- `src-tauri/migrations/0023_embeddings.sql`, `0031_paper_documents.sql`, `0032_paper_document_index_status.sql`, `0034_ask_sessions.sql`
- `src-tauri/src/storage/paths.rs` vector directory support
