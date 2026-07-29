# State Management

> Current state ownership in the LitFolio frontend.

## State Categories

| State | Current owner | Examples |
|---|---|---|
| View-local state | React `useState` | `SmartCollectionEditor.tsx` form fields; `Shell.tsx` palette visibility |
| URL/navigation state | React Router | `AskPage.tsx` and `ComparePage.tsx` use `useSearchParams` |
| Server/native state | TanStack React Query | `Shell.tsx` storage/version counts; `CandidateInboxPage.tsx` candidate queries |
| Small persistent UI state | Zustand + `persist` | `src/lib/store.ts` pane widths under `litera.ui` |
| App-wide provider state | React Context | `ThemeProvider.tsx` and `I18nProvider.tsx` |

Start with the narrowest owner. Keep dialog open flags, drafts, filters, and selection in the page or component that renders them. Use URL state when the state should survive navigation or be linkable.

## Global State

Promote state only when multiple distant parts of the app need the same value or it must persist independently of a route. The current Zustand store is intentionally small:

```ts
export interface UiState {
  threePane: { listW: number; notesW: number };
  setThreePane: (next: Partial<UiState["threePane"]>) => void;
}
```

`useUi` in `src/lib/store.ts` persists that layout state with Zustand's `persist` middleware. Theme and language use dedicated React Context providers because they also perform DOM/storage side effects. Do not add fetched papers, settings DTOs, or mutation status to this store.

## Server State

Create a React Query query with a stable key and an `api` function from `src/lib/api.ts` or a domain module such as `src/lib/apiLibrary.ts`. Mutations invalidate affected keys on success. `main.tsx` installs one `QueryClientProvider` with a 30-second default query `staleTime` and no refetch-on-focus; tests commonly create a local client with retries disabled, as in `src/pages/pageSmoke.test.tsx`.

Use the query cache as the source of truth for backend data. `useFileDrop.ts` invalidates `['papers']` after successful PDF imports, and `usePaperActions.ts` invalidates both list and paper-detail keys after row actions.

## Derived State and Common Mistakes

- Derive indexes and filtered views with `useMemo` when computation is non-trivial; `useCandidateLookup.ts` builds DOI, arXiv, and title maps from query data.
- Do not copy query data into `useState` just to render it.
- Do not use Zustand for route-local forms or server cache.
- Do not call Tauri commands directly from arbitrary components; use the typed API modules and query/mutation boundaries.
- When a mutation changes cached data, invalidate the relevant query key instead of assuming the old cache remains valid.

## Planned Mono Boundary

The current state model is the single-app model above. Mono plugin capability and plugin-owned state boundaries are future contracts in `.trellis/spec/cross-layer/`; they are not implemented and must not be documented or coded as current behavior.
