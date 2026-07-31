# Directory Structure

> Current frontend organization in LitFolio.

## Current Architecture

The frontend is a single Vite/React application under `src/`. Routes are defined in `src/App.tsx`; route pages are lazy-loaded and wrapped in the shared shell, error boundary, and Suspense fallback. There is no frontend package split or plugin directory in the current codebase.

## Directory Layout

```text
src/
├── main.tsx                 # providers, router, theme setup, update check
├── App.tsx                  # lazy route definitions and route boundary
├── components/              # shared UI, shell, dialogs, error boundary
├── hooks/                   # reusable cross-page hooks
├── i18n/                    # English/Chinese dictionaries and providers
├── lib/                     # Tauri APIs, schemas, stores, utilities, types
│   └── types/               # shared API/domain TypeScript types
├── pages/                   # route pages and feature-local modules
│   ├── library/             # library-specific components, hooks, utilities
│   ├── reader/              # reader-specific components and state helpers
│   ├── settings/            # settings-specific panels and tests
│   └── ...
├── styles/                  # global and reader CSS
└── test/                    # Tauri mocks and test fixtures
```

Page entrypoints use `src/pages/<PageName>Page.tsx`, for example `LibraryPage.tsx`, `ReaderPage.tsx`, and `SettingsPage.tsx`. Supporting files stay beside the page when they are feature-specific: `src/pages/library/usePaperActions.ts`, `src/pages/reader/pdfTextExtraction.ts`, and `src/pages/feeds/FeedItemRow.tsx` are representative examples.

## Module Organization

- Put reusable application UI in `src/components/`, such as `Shell.tsx`, `PageHeader.tsx`, and `MarkdownView.tsx`.
- Put logic shared by multiple pages in `src/hooks/` or `src/lib/`. Examples include `useFileDrop.ts`, `useNarrowLayout.ts`, and `apiLibrary.ts`.
- Keep route-specific UI and helpers under the owning page directory. Do not move a library-only row or reader-only parser into shared directories just because it is a component or utility.
- Keep Tauri backend command wrappers in `src/lib/api*.ts`; keep response parsing in `src/lib/apiSchema*.ts`; keep cross-boundary types in `src/lib/types/`. This boundary covers `@tauri-apps/api/core` `invoke` calls, including the standalone `src/lib/syncApi.ts` module used by settings pages.
- Distinguish backend command wrappers from direct native integrations. `src/lib/api.ts` also exposes generic integrations such as `listen` for topic progress and the dialog plugin file pickers; feature-specific event or plugin work remains beside its consumer. Examples include `src/hooks/useFileDrop.ts` and `src/pages/FeedsPage.tsx` for events, and `src/pages/feeds/FeedItemRow.tsx` or `src/pages/library/PaperSupplementsSection.tsx` for plugin actions.
- Do not call backend commands directly from arbitrary components. Add a command to the appropriate `src/lib/api*.ts` domain wrapper (or `src/lib/syncApi.ts` for sync), then consume it through the page or hook's query/mutation boundary. Direct Tauri plugin calls are appropriate when the native action is a UI-local operation such as opening a URL, selecting a file, revealing a path, or subscribing to a feature-local event.
- Use the `@/*` alias for `src/*` imports, as configured in `tsconfig.json` and `vite.config.ts`.

## Naming Conventions

- React components and page files use PascalCase: `PaperDetailDrawer.tsx`, `GraphPage.tsx`.
- Hooks use `use` plus PascalCase: `useFileDrop`, `useCandidateLookup`, `usePaperActions`.
- Non-component utilities use camelCase names: `libraryFilters.ts`, `pdfNavigationHistory.ts`.
- Tests use `.test.ts` or `.test.tsx` beside the implementation. Feature subdirectories use lowercase names such as `pages/reader/` and `pages/library/`.

## Examples

- `src/App.tsx` is the route composition point and demonstrates route-level code splitting.
- `src/components/Shell.tsx` owns application-wide layout and keyboard/drop behavior.
- `src/pages/library/` and `src/pages/reader/` show the preferred feature-local organization.

## Mono Boundary (partial, `mono-core-boundaries`)

The boundary child introduced ownership directories while preserving current routes and behavior:

```text
src/app/          boot, providers, shell and route assembly (AppRoot, AppRoutes, bootstrap)
src/core/         core domain/data contracts and typed clients (contracts/, data/)
src/features/     core feature presentation assembled by app (reader/ReaderAssembly)
src/plugins/      first-party plugin implementation roots (updates/compatibility)
plugin-sdk/       public extension value types only (contracts/PluginManifestV1)
src/host/         host job/lifecycle value contracts (contracts/)
```

Import rules are enforced by tests in `src/test/architecture/importBoundaries.test.ts`: `app` may compose core/features and stable SDK types; `core` imports only core/shared stable value modules; `features` may import public core contracts, never another domain's storage internals; `plugins` may import `plugin-sdk` and their own implementation; `plugin-sdk` cannot import React pages, Tauri internals, or core repositories. Route pages stay in `src/pages/` for now; `src/App.tsx` and `src/pages/ReaderPage.tsx` are compatibility entrypoints into `src/app` and Reader assembly with documented removal owners. Later children extract features and plugins; this structure is not yet the full Mono layout.
