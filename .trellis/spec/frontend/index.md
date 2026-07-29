# Frontend Development Guidelines

> Current conventions for the single LitFolio React frontend.

## Guidelines Index

| Guide | Description | Status |
|---|---|---|
| [Directory Structure](./directory-structure.md) | Module organization and file layout | Complete |
| [Component Guidelines](./component-guidelines.md) | Component patterns, props, composition | Complete |
| [Hook Guidelines](./hook-guidelines.md) | Custom hooks and data fetching | Complete |
| [State Management](./state-management.md) | Local, global, URL, and server state | Complete |
| [Quality Guidelines](./quality-guidelines.md) | Code standards, testing, accessibility | Complete |
| [Type Safety](./type-safety.md) | Type patterns and runtime validation | Complete |

## Scope Note

These documents describe patterns present in the current repository. The frontend is one `src/` application using React, React Router, TanStack React Query, Zustand, Tailwind CSS, and Tauri API wrappers.

Mono/plugin architecture appears in backend and cross-layer planning documents. It is not current frontend structure or behavior. Treat those sections as planned until an owning implementation task promotes them.

## Evidence

Examples in the guides reference current files such as `src/App.tsx`, `src/components/Shell.tsx`, `src/hooks/useFileDrop.ts`, `src/lib/store.ts`, `src/lib/apiSchema.ts`, `src/pages/library/usePaperActions.ts`, `src/pages/pageSmoke.test.tsx`, and `e2e/ui-smoke.spec.ts`.

## Language

Frontend documentation is written in English. User-visible application copy remains bilingual through `src/i18n/en.ts`, `src/i18n/zh.ts`, and the i18n provider.

## Related Specs

- [Backend Guidelines](../backend/index.md)
- [Cross-Layer Guidelines](../cross-layer/index.md)
- [Thinking Guides](../guides/index.md)
