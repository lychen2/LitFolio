# AI Reading Source Map

## Current Core Candidates

- `commands/summaries.rs`: TL;DR, Quick Read, paper/draft translation.
- `commands/reader_translate/`: selection, Markdown, highlight summarize/translate/explain.
- `commands/reader_terms/`: terminology generation and explanation.
- `ai/profile.rs`: profiles, active profile, per-task bindings, output language, and unrelated Obsidian/PDF config.
- `pages/settings/ProfilesTab.tsx` and `ProfileCard.tsx`: profile UI.

## Current Reverse Dependency

`PdfSelectionAskBox.tsx` calls `api.libraryAsk` with `pinnedPaperIds: [paperId]`. This is still the full-library Ask/RAG path and couples core Reader to embeddings, document index state, sessions, and Ask response types.

The replacement is a separate bounded current-paper command with a narrower result type.

## Mixed API Surface

`src/lib/apiAiReader.ts` currently combines:

- core candidates: profiles, summaries, translations, terms, highlights;
- plugin features: Ask sessions/library Ask, query expansion, topic survey;
- advanced/batch actions: batch AI and batch library operations;
- discovery-specific draft translation.

The task must classify and split these rather than move the file wholesale into core.

## Config Risk

`LlmConfig` currently mixes profiles with task assignments, export directory, PDF Markdown/MinerU settings, and Obsidian settings. Backward-compatible parsing and passthrough are required until owning plugin tasks migrate those fields. API keys remain keyring-backed through `ai/profile/persistence.rs` and `secret` support.
