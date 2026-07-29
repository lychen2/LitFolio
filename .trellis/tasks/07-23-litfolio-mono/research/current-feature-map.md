# Current Feature Map

## Evidence Snapshot

This map describes the shared worktree at planning time. It is current-state evidence, not a target directory plan.

Primary anchors:

- `src/App.tsx`
- `src/lib/navigationRegistry.ts`
- `src/components/Shell.tsx`
- `src/components/GlobalOnboarding.tsx`
- `src/components/CommandPalette.tsx`
- `src/pages/LibraryPage.tsx`
- `src/pages/ReaderPage.tsx`
- `src/pages/SettingsPage.tsx`
- `src-tauri/src/commands/mod.rs`

## Static Route and Ownership Map

| Current route | Current role | Target owner |
| --- | --- | --- |
| `/library` | Papers, folders/tags, queue, smart collections, custom fields, duplicates, supplements, summaries, related papers | Core library plus `library-plus`; AI Reading actions remain core |
| `/reader/:paperId` | PDF, highlights, PDF text boxes, structured notes, translation, terms, selection QA | Core Reader and AI Reading; plugin slots for optional actions |
| `/import` | Local PDF plus DOI/arXiv/search/folder flows and job inbox | Core local PDF/BibTeX; network sources in `source-connectors` |
| `/browse` | arXiv/search discovery and draft import | `source-connectors` / `discovery-feeds` |
| `/feeds` | RSS sources, refresh, metadata, candidate linking | `discovery-feeds` |
| `/topic` | Topic search, survey, alerts, shortlist | discovery contributions; surveys/research chains are non-core |
| `/candidates` | Candidate inbox from feeds/discovery | `discovery-feeds` |
| `/projects` | Projects, evidence, weekly review, writing | `research-workbench` |
| `/compare` | Paper comparison CRUD and AI generation | `research-workbench` |
| `/ask` | Full-library Ask/RAG sessions | `library-ask` |
| `/graph` | Links, concepts, citations, similarity, graph canvas | `knowledge-graph` |
| `/settings` | Core app/AI settings mixed with sync, alerts, custom fields, duplicates, export, Obsidian | Core settings host plus plugin settings slots |

`src/App.tsx` lazily splits page chunks but still imports every page entry in one static route registry. `src/lib/navigationRegistry.ts` similarly declares all navigation groups and entries at module load time. Lazy chunks reduce initial transfer but do not provide build-time plugin exclusion or runtime lifecycle control.

## Composite Surfaces That Must Be Split by Contribution

### Library

The library is not a single ownership unit. Core owns paper listing, metadata, folders/tags, local search, basic export, and Reader entry. Queue, smart collections, custom fields, duplicate tools, supplements, full-library AI, similarity, and research actions need plugin contributions rather than direct imports.

### Reader

The Reader currently owns PDF rendering, highlight mutations, PDF-linked note UI, structured notes, terminology, translation, and selected-text/current-paper questions. The target keeps PDF, annotations, terminology/translation, and bounded AI Reading in core while exposing stable toolbar, selection, side-panel, and decorator slots.

### Settings

Settings currently combines core profiles/application controls with optional sync, topic alerts, custom fields, duplicate management, Obsidian, and other integrations. The target settings route is core; optional sections register through `settings.sections`.

## Current Reverse Dependencies

- `src/components/Shell.tsx` always queries topic-alert unseen count and vector-inclusive storage stats through the global `api` object.
- `src/components/GlobalOnboarding.tsx` always queries project state and includes a Projects onboarding step, even though Projects is optional in Mono.
- `src/components/CommandPalette.tsx` consumes the static full navigation registry and global unified-search results.
- `src/lib/api.ts` remains a broad aggregation surface even though `apiLibrary.ts`, `apiAiReader.ts`, and `apiKnowledge.ts` have begun domain splitting.
- `src-tauri/src/commands/mod.rs` chains all domains into one final `tauri::generate_handler!` invocation.

These reverse dependencies must be removed before disabling a plugin can be complete.

## First-Party Plugin Map

| Plugin | Current feature sources |
| --- | --- |
| `source-connectors` | DOI/arXiv/network search, remote PDF acquisition, external import drafts |
| `discovery-feeds` | RSS, feed metadata, Browse/Topic/Candidates, topic alerts, recommendations |
| `library-ask` | embeddings, vectors, full-library RAG, Ask sessions |
| `research-workbench` | projects, project papers, evidence, comparisons, literature review, writing |
| `knowledge-graph` | paper links, concepts, citations, similarity, graph views |
| `library-plus` | reading queue, smart collections, custom fields, duplicates, supplements |
| `sync-integrations` | WebDAV/library sync and related settings |
| `document-services` | Obsidian export and MinerU/document conversion services |

## Core-Only Navigation Expectation

A core-only build exposes Library, local Import, Reader, and Settings. Optional routes, nav entries, command-palette actions, settings sections, Reader actions, background jobs, and backend commands appear only from included and enabled plugin contributions.
