# Knowledge Graph Source Map

## Current UI

- `GraphPage.tsx` and `src/pages/graph/` contain network graph, mind map, sidebar, toolbar, decision, edge actions, and performance helpers/tests.
- `SimilarPapersPanel.tsx` embeds optional similarity directly in Library.
- Graph renderer dependency `react-force-graph-2d` is unconditional in `package.json`.

## Current Backend/Data

- `commands/graph.rs`: graph data, manual links, AI suggestions/decisions.
- `commands/concepts.rs`: concept CRUD, relations, paper links, extraction.
- `commands/discovery.rs` plus `discovery/similar.rs`/`citations.rs`: similarity and citations.
- `0010`: paper links; `0017`: citation cache; `0024`: concepts/relations/paper concepts.

## Ownership Boundaries

Citation relationship/discovery data belongs to this plugin. Generic BibTeX/citation formatting from paper metadata remains core basic export.

Recommendation cache remains with discovery. Projects/evidence remain Research Workbench. AI extraction uses core AI capability and does not import AI implementation internals.
