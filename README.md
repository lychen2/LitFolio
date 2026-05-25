# LitFolio

[English](./README.md) · [中文](./README.zh-CN.md)

Local-first literature manager for researchers: import papers, read them in-app
with highlights + Markdown notes, ask questions across your library, and watch
journal RSS feeds for new releases — all powered by a configurable LLM stack
that talks to any OpenAI-compatible endpoint.

## Features

- **Library**: import via DOI / arXiv ID / BibTeX / local PDF / Semantic Scholar
  search. Every paper carries a PDF. Filter by folder (a paper can live in many
  folders) or by tag.
- **Reader**: PDF.js viewer with react-pdf-highlighter, three-pane layout
  (highlights · PDF · Markdown notes), dark-mode toggle.
- **AI workflows**: TL;DR, four-section Quick Read (problem / method /
  comparison / limitations), title + abstract translation. Each task can be
  bound to a different model.
- **Topic discovery**: LLM-rewritten English search terms → multi-query
  Semantic Scholar fan-out → deduped, citation-ranked results. Optional
  LLM-annotated literature survey skeleton (subareas + key PIs + must-reads).
- **Library Q&A (RAG)**: LLM rewrites your question into 2–4 English search
  terms, fans them out across SQLite FTS5, merges results by term-match count,
  enriches snippets with user highlights, and answers with inline `[N]`
  citations.
- **RSS subscriptions**: subscribe to journal RSS / Atom feeds (arXiv, Optica,
  Nature, ACS Photonics, ScienceDirect…), conditional-GET refresh, click-through
  detail drawer with one-tap title/abstract translation. 入库 jumps to the
  Import page with the source link pre-filled.
- **Local-first**: everything lives under `~/Litera-Library/`.

## Stack

Tauri 2 · React 18 · TypeScript · SQLite (sqlx) · feed-rs · react-pdf-highlighter

## Quick start

```bash
pnpm install
pnpm tauri dev
```

The first launch creates `~/Litera-Library/` and seeds a default set of optics /
photonics journal RSS feeds. Configure your LLM profile in Settings → 模型配置
before using any AI workflow.

## Layout

```
src/                  React frontend
  components/         Shared UI (Shell, ...)
  pages/              Top-level routes (library / reader / import /
                      browse / feeds / topic / ask / settings)
  pages/<feature>/    Per-page subcomponents
  lib/                Frontend API client + utils
  styles/             Tailwind globals

src-tauri/            Rust backend
  src/commands/       IPC surface (Tauri commands)
  src/storage/        SQLite layer + sqlx migrations
  src/ingest/         Import pipeline (DOI / arXiv / BibTeX / PDF / S2 / RSS)
  src/ai/             LLM client, profile config, summarization / translation /
                      query rewrite / RAG / topic survey
  migrations/         Versioned SQL migrations
```

## License

GPL-3.0-or-later — see [`LICENSE`](./LICENSE).
