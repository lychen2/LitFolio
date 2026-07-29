# Hook Guidelines

> Current custom hook patterns in LitFolio.

## Naming and Placement

Custom hooks begin with `use` and use PascalCase: `useFileDrop`, `useNarrowLayout`, `useCandidateLookup`, and `usePaperActions`. Put hooks shared across pages in `src/hooks/`. Put a hook used only by one feature beside that feature, as with `src/pages/library/usePaperActions.ts`.

A hook should return the state and callbacks its consumer needs, with stable callbacks where an effect or child dependency requires them. `useCandidateLookup()` returns the React Query result plus a derived `findCandidate` function; `usePaperActions()` returns mutation objects, a row ref, and `openPdf()`.

## Data Fetching

TanStack React Query is the current server-state hook. Use a descriptive, stable `queryKey`, put the Tauri API call in `queryFn`, and configure freshness or refetch behavior deliberately.

```tsx
export function useImportedArxivIds() {
  return useQuery({
    queryKey: ["papers", "arxiv-ids"],
    queryFn: api.papersAllArxivIds,
    staleTime: 60_000,
  });
}
```

For writes, use `useMutation` or the project wrapper `useApiMutation` when a normalized `errorMessage` is useful. Invalidate affected query keys in `onSuccess`; `usePaperActions.ts` shows list and detail invalidation after a paper mutation. Use `useQueryClient()` for invalidation rather than maintaining duplicate fetched data in local state.

## Effects and Browser/Desktop Events

Use `useEffect` for subscriptions, browser listeners, and Tauri events. Return cleanup functions. `useFileDrop.ts` registers three Tauri drag listeners and calls every returned unlistener on unmount; `FeedsPage.tsx` subscribes to the feed metadata event and cleans up the listener. Keep event setup out of render and make dependencies explicit.

Backend command calls still go through the typed wrappers in `src/lib/api*.ts` or `src/lib/syncApi.ts`. A hook or page may import a Tauri plugin directly for a UI-local native operation or event when it owns the lifecycle: `PdfTab.tsx` listens for folder-import progress and opens a directory picker, while feed rows use the opener plugin to open an external URL. These direct integrations are not backend command wrappers and should still be cleaned up or kept behind the smallest owning feature boundary.

Use `useMemo` only for a meaningful derived value, such as the candidate indexes in `useCandidateLookup`. Use `useCallback` when passing a callback into an effect or a hook such as `usePdfDropTarget`.

## Common Mistakes

- Do not call hooks conditionally or inside callbacks; the ESLint React Hooks rules enforce this.
- Do not fetch Tauri data directly during render or duplicate React Query cache in a second global store.
- Do not omit query invalidation after mutations that change visible data.
- Do not register window or Tauri listeners without cleanup.
- Avoid broad effect dependencies or suppressing `react-hooks/exhaustive-deps`; the rule is enabled as a warning and should still be resolved intentionally.

## Planned Mono Boundary

These are the current app hook conventions. Mono/plugin lifecycle hooks and plugin-owned data hooks are planned contracts, not available frontend APIs. Keep new hooks in the current directories until a promoted task changes the structure.
