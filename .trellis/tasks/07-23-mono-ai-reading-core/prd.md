# Move AI Reading into Mono Core

## Goal

Make direct, user-triggered AI assistance for the current paper a coherent, non-agentic core capability while removing its dependencies on full-library Ask, projects, topics, graph workflows, retrieval, and task orchestration.

## Dependencies

- `mono-core-boundaries` is completed and archived.
- `mono-reader-annotations` and `mono-provenance-reading` are completed before Reader context, annotation insertion, or source-aware AI integration is switched.
- The parent-owned context-envelope, proposal, execution-record, and cancellation contracts are reviewed; this child implements the core AI consumer/vertical slice without creating a second host contract.

## Requirements

- Core AI Reading includes profile management, one active reading profile/model, TL;DR, Quick Read, paper/selection translation, terminology generation/explanation, highlight summarize/translate/explain, and current-paper or selected-text questions.
- Add a bounded current-paper question command that uses a host-constructed, immutable context envelope containing only approved current-paper/selection/highlight references, accepted document/source revisions, budgets, truncation flags, provenance, and warnings. The envelope is frozen before provider dispatch.
- Reject references that do not belong to the requested paper. Empty or missing document scope may fall back only to that paper's metadata/abstract and must never widen to the library.
- Resolve core Reader actions through one explicit active reading model instead of per-feature planning chains. Preserve legacy config compatibility and secrets.
- Keep API keys in the existing keyring-backed secret path; never expose them to frontend responses or logs.
- AI calls occur only after an explicit user action. Each dispatch uses a real host-owned cancellation token propagated to provider I/O; cancellation or Reader/lifecycle revocation prevents late persistence and returns a terminal structured result. Loading the library or Reader must not call an LLM endpoint.
- Persist a core-owned, redacted execution record for every AI dispatch, including operation, trigger, context-envelope reference, model/profile reference without secrets, running/terminal state, timing, cancellation, degradation, and safe result/error summary.
- Missing or invalid profiles produce a structured configuration state for AI controls but do not block local library, Reader, or annotation behavior.
- Split full-library Ask/session APIs, batch orchestration, topic survey, query expansion, project/literature review, link/concept extraction, and discovery-draft translation from the core AI client.
- Persist dedicated generated outputs such as user-requested TL;DR, translation, or terminology in typed core-owned fields. Any AI output that would alter user-authored notes, annotations, tags, metadata, or accepted documents must create a revision/hash-bound proposal for explicit review and host apply; no AI result directly overwrites user content.

## Constraints

- Preserve existing profile/config files and keyring entries through a backwards-compatible reader/migration adapter.
- Do not implement embeddings, plugin context injection, or full-library retrieval in the core question path.
- Do not add tools, skills, autonomous planning, generic agent loops, Ask-style conversations, or plugin-provided context to core AI Reading.
- Do not redesign all Settings UI; provide a clear core profile/active-reading-model surface.
- Annotation-specific UI integration cannot bypass the Reader controller from the prior child.

## Out of Scope

- `library-ask`, Research Workbench, discovery, graph, and batch-library AI implementations.
- Full-library scope approval, retrieval ranking, semantic/hybrid search, embeddings, conversation sessions, tool calls, and skills.
- Plugin-provided model orchestration or a general autonomous planning chain.
- Background AI on startup.

## Acceptance Criteria

- [ ] All listed AI Reading actions use the active core reading model and typed structured errors.
- [ ] Current-paper/selection questions use only the requested paper/selection context and never query embeddings or unrelated papers.
- [ ] Context tests prove the host freezes authorized refs, source hashes/revisions, budgets, truncation, provenance, and warnings before dispatch; malformed, stale, cross-paper, appended-after-freeze, and empty-widening requests are rejected.
- [ ] Opening core routes with no profile performs no AI network request and all local workflows remain usable.
- [ ] A configured profile completes TL;DR, Quick Read, translation, terminology, highlight actions, and current-paper/selection question tests.
- [ ] Cancellation aborts mock provider I/O, records one terminal `cancelled` execution, and blocks late result publication or persistence.
- [ ] User-content changes produce reviewable base revision/hash proposals with conflict/idempotent-apply tests; dedicated generated fields remain typed direct outputs.
- [ ] Every AI dispatch creates a redacted running record and exactly one terminal succeeded/failed/cancelled record without secrets or full private excerpts.
- [ ] Legacy profile/config and keyring fixtures load without losing secrets; plugin-owned legacy assignments remain recoverable for later extraction.
- [ ] Core AI modules have no imports from Ask sessions, retrieval/vector/embedding code, tools/skills, projects, topics, survey, graph, discovery, or plugin implementations.
- [ ] Typecheck, lint, frontend tests, relevant Cargo tests, command parity, and Reader AI E2E flows pass.

## Source Anchors

- `src/lib/apiAiReader.ts`, `src/lib/types/ai.ts`, `src/lib/apiSchema.ts`
- `src/pages/settings/ProfilesTab.tsx`, `ProfileCard.tsx`, `TaskAssignments.tsx`
- `src/pages/library/QuickReadDrawer.tsx`
- `src/pages/reader/PdfSelectionAskBox.tsx`, `SelectionTranslatePane.tsx`, `TermsPane.tsx`
- `src-tauri/src/ai/profile.rs`, `ai/profile/persistence.rs`, `ai/client.rs`
- `src-tauri/src/commands/llm.rs`, `summaries.rs`, `reader_translate/`, `reader_terms/`
- `src-tauri/src/commands/ask.rs`, `commands/ask/library.rs` as separation inputs
