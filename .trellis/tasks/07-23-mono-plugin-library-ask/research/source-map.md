# Library Ask Source Map

## Current UI/API

- `AskPage.tsx` and `src/pages/ask/` own composer, workflows, source display, and session behavior.
- Ask methods and types are split between `apiAiReader.ts`, `apiKnowledge.ts`, `apiSchema.ts`, and shared API types.
- Core Reader currently calls `libraryAsk` for selected text; the AI core task removes this reverse dependency first.

## Current Backend/Data

- `commands/ask.rs` and `commands/ask/` mix capability state, session operations, retrieval, local fallback, and note export.
- `storage/embeddings.rs` and migration `0023` store derived embeddings in the core database.
- migration `0034` stores Ask sessions with optional project references.
- `LibraryPaths::vectors_dir()` exposes a shared legacy vector directory.
- `paper_documents`/document FTS from `0031`/`0032` remain core-owned source material.

## Boundary Decision

The plugin owns derived embeddings, vector files, Ask sessions, and retrieval workflows. Core owns canonical documents. The plugin receives bounded document DTOs through `papers` capability and cannot open the core pool.

Project references are scalar IDs only. No cross-plugin foreign key or direct Research Workbench import is allowed.
