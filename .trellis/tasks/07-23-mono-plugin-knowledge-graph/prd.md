# Extract Knowledge Graph Plugin

## Goal

Move graph visualization, paper links, concepts, citation relations, similarity discovery, and AI-assisted graph actions into an independently disableable `knowledge-graph` plugin.

## Dependencies

- `mono-plugin-host-sdk` is completed and archived.
- Core paper, document, AI, network, event, and UI capabilities are stable.

## Requirements

- Own `/graph`, graph/mind-map UI, paper links, concepts/relations, paper concepts, citation cache/relations, similarity/citation discovery, and AI link/concept actions.
- Register route/navigation/command palette, Library similar/link panels, paper actions, Reader decorators/actions, settings, jobs, and events only through plugin contributions.
- Move legacy migrations `0010`, `0017`, and `0024` data into `plugins/knowledge-graph/data.db`.
- Store stable core paper IDs as scalar references and resolve paper metadata through capabilities; no core-database or cross-plugin foreign keys.
- Use scoped network capability for citation/similarity discovery and core AI capability for explicit link/concept generation.
- Preserve manually created links distinctly from generated/rejected suggestions and retain provenance/status.
- Remove graph-exclusive frontend/native dependencies from core ownership so build pruning can exclude them later.
- Disable removes graph contributions/commands and cancels discovery/AI jobs while retaining graph data.
- Handle missing core papers as unresolved graph references without silently deleting edges/concepts.

## Constraints

- Core citation formatting/basic export remains core; the plugin owns citation relationship/discovery data, not generic citation formatting.
- No hard dependency on source/discovery or Library Ask plugin internals.
- Graph rendering performance behavior must not regress on current fixtures.

## Out of Scope

- A remote collaborative graph service.
- Full-library RAG or project evidence.
- Final bundle pruning, which is owned by `mono-build-pruning`.

## Acceptance Criteria

- [ ] Core-only build exposes no Graph route/panels/actions/commands and does not load graph rendering code.
- [ ] Enabling restores graph, mind map, link CRUD, concepts, citations, similarity, provenance, and AI suggestion parity.
- [ ] Sidecar conversion preserves manual/AI link state, concepts, citation direction, and paper references with rollback.
- [ ] Missing papers appear as unresolved references; manual graph data is not lost.
- [ ] Disable during discovery/AI work cancels jobs, removes contributions, closes storage, and retains data.
- [ ] Network/AI permission denial and plugin-disabled/incompatible errors are structured and isolated.
- [ ] Graph unit/performance tests, frontend/backend lifecycle tests, typecheck, lint, Vitest, Cargo, and Graph E2E pass.

## Source Anchors

- `src/pages/GraphPage.tsx`, `src/pages/graph/`
- `src/pages/library/SimilarPapersPanel.tsx`
- `src-tauri/src/commands/graph.rs`, `commands/concepts.rs`, `commands/discovery.rs`
- `src-tauri/src/storage/paper_links.rs`, `storage/paper_links/`, `storage/concepts.rs`, `storage/concepts/`
- `src-tauri/src/discovery/similar.rs`, `discovery/citations.rs`, `ai/concept_extract.rs`
- migrations `0010_paper_links.sql`, `0017_citations.sql`, `0024_concepts.sql`
- `react-force-graph-2d` dependency in `package.json`
