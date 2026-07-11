# Project Agent Instructions

## Project Name
LitFolio — a local-first desktop literature manager with LLM-assisted reading, summarization, discovery, and research workflows.

## Overview
LitFolio is a Tauri 2 desktop application that combines a React/TypeScript frontend with a Rust backend. It is designed around local-first literature management: imported papers, notes, highlights, metadata, feeds, generated Markdown, and SQLite state are stored on the user's machine rather than in a hosted service.

The frontend provides the application shell, route-level pages, PDF reading workflows, graph views, project/evidence boards, RSS feeds, settings, and LLM-assisted features. The Rust backend exposes Tauri IPC commands for persistence, PDF/document ingestion, metadata lookup, search, feed refreshes, AI workflows, exports, diagnostics, and library synchronization.

The project is optimized for desktop distribution through Tauri, with strict TypeScript checks, Rust modules organized by domain, SQLite migrations, built-in updater configuration, and tests covering frontend utilities/components, command parity, Rust storage/ingest logic, and Playwright smoke coverage.

## Technology Stack
- **Language/Runtime**: TypeScript/React on Node.js for the frontend; Rust 2021 for the Tauri backend.
- **Framework(s)**: Tauri 2, React 18, Vite 5, React Router 6, TanStack React Query, Tailwind CSS.
- **Key Dependencies**: `@tauri-apps/api`, Tauri plugins for dialog/fs/process/opener/updater, TanStack Table/Virtual, Zustand, `pdfjs-dist`, `react-pdf-highlighter`, KaTeX, `react-force-graph-2d`, `sqlx` with SQLite, `reqwest`, `tokio`, `serde`, `tracing`, `keyring`, `lopdf`, `feed-rs`.
- **Build Tools**: pnpm, Vite, TypeScript compiler, Tauri CLI, Cargo, PostCSS, Tailwind CSS.
- **Quality Tools**: ESLint 9, `@typescript-eslint`, React Hooks lint rules, Vitest, Playwright, Rust unit/integration tests, strict `tsconfig` settings (`strict`, `noUnusedLocals`, `noUnusedParameters`).

## Project Structure
```text
.
├── AGENTS.md                 # Project instructions for AI/agent workflows.
├── package.json              # Frontend scripts, dependencies, and package metadata.
├── pnpm-lock.yaml            # pnpm dependency lockfile.
├── index.html                # Vite HTML entrypoint.
├── vite.config.ts            # Vite/Vitest config, Tauri dev server port, test exclusions.
├── tsconfig.json             # Strict TypeScript configuration and `@/*` path alias.
├── eslint.config.js          # ESLint flat config and project-specific restrictions.
├── tailwind.config.js        # LitFolio theme tokens, typography, dark mode, content paths.
├── postcss.config.js         # Tailwind/PostCSS pipeline.
├── playwright.config.ts      # E2E configuration and dev-server setup.
├── src/                      # React frontend application.
│   ├── main.tsx              # React root, i18n provider, query client, router, updater check.
│   ├── App.tsx               # Route definitions and lazy-loaded page chunks.
│   ├── components/           # Shared UI components, dialogs, shell, error boundary.
│   ├── hooks/                # Reusable React hooks for layout, mutations, imports, drag/drop.
│   ├── i18n/                 # English/Chinese dictionaries, provider, formatting helpers.
│   ├── lib/                  # Tauri API wrappers, schemas, store, navigation, utilities.
│   ├── pages/                # Feature pages: Library, Reader, Import, Ask, Topic, Feeds, Graph, Projects, Settings.
│   ├── styles/               # Global and reader-specific CSS.
│   └── test/                 # Tauri mocks and frontend test fixtures.
├── src-tauri/                # Rust/Tauri backend application.
│   ├── Cargo.toml            # Rust package metadata, dependencies, release profile.
│   ├── tauri.conf.json       # Tauri product metadata, CSP, bundle/updater/resource config.
│   ├── migrations/           # SQLite schema migrations.
│   ├── capabilities/         # Tauri capability permissions.
│   ├── icons/                # Application icons.
│   ├── tests/                # Rust integration tests.
│   └── src/                  # Backend source modules.
│       ├── lib.rs            # Tauri builder, plugins, app state, command registration.
│       ├── main.rs           # Native binary entrypoint.
│       ├── commands/         # Tauri IPC command surface grouped by feature.
│       ├── storage/          # SQLite repositories, models, paths, retrieval, migrations support.
│       ├── ingest/           # DOI/arXiv/BibTeX/PDF/RSS/topic ingestion logic.
│       ├── ai/               # LLM clients, prompts, summaries, translation, QA, surveys.
│       ├── discovery/        # Similarity/citation discovery helpers.
│       ├── export/           # Export and citation helpers.
│       └── library_sync/     # Local/WebDAV sync support.
├── e2e/                      # Playwright end-to-end tests.
├── scripts/                  # Utility scripts for bundle reports, Playwright setup, fixtures.
├── docs/                     # Project notes/manual assets; only bundled manual PDFs should be committed per release rules.
├── public/                   # Static frontend assets.
├── .github/                  # GitHub workflows and repository automation.
└── .snow/                    # Snow CLI project settings, hooks, notebooks, and optional skills.
```

## Key Features
- Local-first paper library backed by SQLite and filesystem-managed paper/note assets.
- Paper import from PDFs, DOI, arXiv, BibTeX, search results, feeds, and candidate inbox workflows.
- PDF reader with highlights, notes, translations, summaries, term extraction, document Markdown, and navigation helpers.
- LLM-powered TL;DR, quick-read summaries, translation, library Q&A/RAG, topic surveys, literature review generation, query expansion, and project writing support.
- Tags, folders, smart collections, custom fields, reading queue, duplicate detection, and batch operations.
- RSS feed management with metadata enrichment and candidate paper creation.
- Citation/similarity graph, manual paper links, AI-discovered links, concepts, evidence boards, and research projects.
- Markdown/citation export, diagnostics log export, local/WebDAV sync foundations, Tauri updater configuration, and bundled user manuals.
- Bilingual UI support through the `src/i18n` dictionaries.

## Getting Started

### Prerequisites
- Node.js with pnpm available on PATH.
- Rust toolchain compatible with `rust-version = "1.77"` or newer.
- Tauri 2 system prerequisites for the target OS.
- Platform libraries required by Tauri/WebView and by native dependencies such as keyring/SQLite.
- Optional: Playwright browsers for E2E tests (`pnpm test:e2e` runs `scripts/check-playwright-browsers.mjs`).

### Installation
```bash
pnpm install
```

### Usage
```bash
pnpm dev          # Run the Vite frontend dev server on port 1420.
pnpm tauri:dev   # Run the desktop app in Tauri dev mode.
pnpm build        # Type-check and build the frontend bundle.
pnpm tauri:build  # Build the packaged desktop app through Tauri.
```

## Development

### Available Scripts
- `pnpm dev` — start Vite for frontend development.
- `pnpm build` — run `tsc --noEmit` and `vite build`.
- `pnpm preview` — preview the built frontend bundle.
- `pnpm tauri` — pass commands directly to the Tauri CLI.
- `pnpm tauri:dev` — launch the Tauri desktop app in development.
- `pnpm tauri:build` — build Tauri desktop artifacts.
- `pnpm typecheck` — run TypeScript without emitting files.
- `pnpm lint` — run ESLint on `src`.
- `pnpm lint:strict` — run ESLint with `--max-warnings=0`.
- `pnpm test` — run Vitest tests.
- `pnpm test:e2e` — verify Playwright browsers and run Playwright tests.
- `pnpm bundle:report` — generate a bundle-size report with `scripts/bundle-report.mjs`.

### Development Workflow
1. Keep frontend API calls in `src/lib/api*.ts` aligned with backend Tauri command names registered in `src-tauri/src/commands/mod.rs`.
2. For new backend data features, add or update SQLite migrations in `src-tauri/migrations/`, storage repositories in `src-tauri/src/storage/`, command handlers in `src-tauri/src/commands/`, and typed frontend parsers/schemas in `src/lib/apiSchema*.ts`.
3. Prefer feature-local React code under `src/pages/<feature>/` and shared UI under `src/components/`.
4. Run focused tests while developing, then run at least `pnpm typecheck`, `pnpm lint`, and `pnpm test` before handing off substantial changes.
5. For Tauri/Rust changes, run the relevant Cargo tests from `src-tauri` when possible.
6. Do not use page-level `dangerouslySetInnerHTML`; ESLint requires centralized Markdown rendering through `src/components/MarkdownView.tsx`.

### Release / GitHub Publishing Rules
1. Release version numbers must be updated together in all four files before tagging: `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and `src-tauri/Cargo.lock`.
2. The app version shown in `pnpm tauri dev` comes from the Rust/Tauri package metadata; forgetting `src-tauri/Cargo.toml` leaves the UI showing the previous version.
3. GitHub Release notes do not need to be committed as Markdown files. Keep release-note drafts local or write them directly into the GitHub Release body.
4. Do not commit `RELEASE_NOTES*.md`, release summaries, checklists, planning notes, or generated documentation sources.
5. Under `docs/`, the only files allowed in git are the bundled manual PDFs: `docs/manual/manual.pdf` and `docs/manual/manual-en.pdf`.
6. The release workflow should build signed updater artifacts in GitHub Actions using `TAURI_SIGNING_PRIVATE_KEY` and publish `latest.json`; do not do local release builds unless explicitly asked.
7. `.gitignore` only blocks newly untracked files. If a Markdown or docs file was ever tracked, remove it with `git rm --cached` or history rewrite when the remote tree/history must be clean.

## Configuration
- `src-tauri/tauri.conf.json` controls the Tauri product name (`LitFolio`), version, identifier, dev/build commands, CSP, asset protocol scope, bundle resources, icons, updater endpoints, and plugin settings.
- `src-tauri/Cargo.toml` controls the Rust package name (`litera`), version, dependencies, feature flags, and release profile.
- `package.json` controls frontend package metadata, dependency versions, and pnpm scripts.
- `tsconfig.json` enables strict TypeScript and the `@/*` alias to `src/*`.
- `vite.config.ts` configures React, the Tauri dev server port, test exclusions, and the E2E alias for Tauri core mocks.
- `eslint.config.js` applies TypeScript/React linting and project-specific safety rules.
- `tailwind.config.js` defines LitFolio theme colors, fonts, typography, and dark mode.
- LLM profiles and secrets are managed through app settings/keyring-backed storage in the backend rather than checked-in config files.
- Runtime library data is rooted in the backend `LibraryPaths` abstraction and includes papers, notes, attachments, vectors, logs, and the SQLite database.

## Architecture
LitFolio uses a layered desktop architecture. The React frontend renders route-level pages through `src/App.tsx`, provides global providers in `src/main.tsx`, manages asynchronous state with TanStack React Query, and accesses native functionality through typed API wrappers in `src/lib/api*.ts`.

The Tauri backend initializes in `src-tauri/src/lib.rs`, installs plugins, creates shared `AppState`, bootstraps filesystem paths and the SQLite pool in `startup.rs`, runs migrations, and exposes commands through `src-tauri/src/commands/`. Commands delegate to domain modules rather than embedding persistence or network logic directly.

Persistence is organized through repository modules in `src-tauri/src/storage/`, with migrations under `src-tauri/migrations/`. Ingestion modules handle external paper sources and document parsing, AI modules handle LLM prompts/clients/workflows, and discovery/export/sync modules isolate specialized backend capabilities. The frontend and backend are coupled at the IPC boundary through command names, argument shapes, response schemas, and command parity tests.

## Contributing
- Preserve strict TypeScript and Rust error handling; prefer typed parsers and explicit data models over `any` or unchecked JSON.
- Keep UI changes consistent with existing Tailwind theme tokens and component patterns.
- Add tests near the changed code: Vitest for frontend utilities/components, Playwright for user flows, and Rust unit/integration tests for backend logic.
- When adding Tauri commands, update backend registration, frontend API wrappers, response parsers, mocks, and command parity tests.
- When changing persistence, add a new migration instead of editing historical migrations after they may have shipped.
- Protect local-first behavior: avoid introducing network dependencies into startup or core library operations unless guarded and recoverable.
- Treat release metadata and updater configuration as coordinated changes; follow the release rules above.

## License
GPL-3.0-or-later. See `LICENSE` for the full GNU General Public License text.
