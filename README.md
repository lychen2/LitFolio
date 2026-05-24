# Litera

Local-first literature management desktop app with LLM-powered TL;DR, structured
extraction, smart tagging, RAG Q&A, and Markdown notes.

**Stack:** Tauri 2 · React 18 · TypeScript · SQLite (sqlx) · Tantivy · sqlite-vec

## Quick start

```bash
pnpm install
pnpm tauri dev
```

## Plan

The full work plan is at `../../.omc/plans/litera-desktop-plan.md` — milestones
M0 (skeleton) → M9 (graph view). This repo currently implements M0.

## Layout

```
src/                  React frontend
  components/         Shared UI (Shell, ...)
  pages/              Top-level routes (Library, Reader, Import, Ask, Settings)
  features/           Feature modules (library, reader, ai, settings, import)
  lib/                Frontend utilities
  styles/             Tailwind globals

src-tauri/            Rust backend
  src/commands/       IPC surface
  src/storage/        SQLite layer  (M1)
  src/ingest/         Import pipeline (M2)
  src/ai/             LLM client + workflows (M4-M5)
  src/index/          Search / vector index (M6)
  src/cluster/        Tag clustering (M5)
```

## License

MIT
