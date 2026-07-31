# Type Safety

> Current TypeScript and runtime boundary conventions.

## Compiler and Type Organization

TypeScript runs with `strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `isolatedModules`, and `noEmit` in `tsconfig.json`. The frontend targets ES2022 and uses the `@/*` alias for `src/*`.

Shared API/domain types live in `src/lib/types/` (`types/api.ts`, `types/ai.ts`, `types/knowledge.ts`, and others). `src/lib/api.ts` re-exports the public types so pages commonly import `type Paper` or `type FilterRule` from `@/lib/api`. Feature-only types may stay beside the feature, such as `src/pages/import/types.ts` and `src/pages/reader/highlightTypes.ts`.

## Tauri API and Validation

Tauri backend command wrappers are grouped by domain in `src/lib/apiLibrary.ts`, `apiAiReader.ts`, and `apiKnowledge.ts`. `src/lib/syncApi.ts` is a separate typed wrapper for WebDAV sync commands and is consumed directly by settings pages; it is not currently spread into the `api` object in `src/lib/api.ts`. `src/lib/api.ts` composes the three main domain APIs and also contains non-command integrations: topic progress `listen` and dialog plugin file pickers. Feature-local Tauri events and plugins may remain in hooks/pages when they own a UI workflow, as in `src/hooks/useFileDrop.ts`, `src/pages/FeedsPage.tsx`, and `src/pages/import/PdfTab.tsx`.

The command wrapper layer currently uses both typed `invoke<T>` and `invokeParsed`. `invokeParsed` calls `invoke<unknown>` and passes the result through a parser with a command-specific error path:

```ts
export async function invokeParsed<T>(
  command: string,
  args: Record<string, unknown> | undefined,
  parser: (value: unknown, path: string) => T,
): Promise<T> {
  return parser(await invoke<unknown>(command, args), command);
}
```

Existing code uses typed `invoke<T>` for void results, scalars, and several established DTOs, for example `invoke<void>("feed_remove", { id })`, `invoke<number>("papers_count")`, and `invoke<LlmTestResult>("llm_test", { profile })`. It uses `invokeParsed` for validated structured responses, for example `papers_recent`, `feeds_list`, `graph_data`, and the sync preview/push/pull reports. For a new structured backend response, prefer adding a shared TypeScript type and parser in `src/lib/apiSchema.ts`, then calling it through `invokeParsed`; use typed `invoke<T>` when the result is a primitive, `void`, or an intentionally unparsed legacy/stable DTO that matches the current wrapper convention. Do not imply that every existing typed invocation has runtime validation.

Runtime parsers are handwritten in `src/lib/apiSchema.ts` using primitives from `apiSchemaCore.ts`; there is no Zod, Yup, or io-ts dependency in the current frontend. `object(value, path)` validates that a response is a non-null object and returns a `Shape`. `field(obj, key, path)` only verifies that the key exists and returns its value as `unknown`; it does not validate the value or reject extra keys. The typed helpers (`stringField`, `numberField`, `booleanField`, nullable/optional helpers, enum helpers, and `stringArrayField`) perform the actual value checks. `field` is therefore commonly followed by `parseArray`, `parseNullable`, or a nested parser.

Most structured fields are checked recursively, but these current DTO fields intentionally remain `unknown` after presence validation: `AskSession.conversation`, `AskSession.saved_artifacts`, `JobRecord.details`, and `Highlight.rect`. Preserve that behavior unless the backend contract and frontend type are deliberately narrowed together. Other uses of `field` are inputs to a parser, such as `PdfImportSummary.imported`, `LlmConfig.profiles`, `GraphData.nodes`, `FeedItem.metadata`, and `SyncPreviewReport.changes`.

## Common Patterns

- Prefer explicit interfaces, type aliases, unions, and typed callback parameters over inferred `any`.
- Use `unknown` at untrusted boundaries, then narrow it with parser helpers or type guards. `errorMsg(e: unknown)` in `useApiMutation.ts` is the local error-normalization example.
- Use `ReturnType` for a hook state type when it is useful, as `PaperActionsState` does in `usePaperActions.ts`.
- Keep nullable API fields explicitly nullable and preserve backend enum unions through parser functions.
- Use `type`-only imports where appropriate; `isolatedModules` and strict unused checks are active.

## New-Code Guidance and Current Debt

- In new code, prefer explicit interfaces, type aliases, unions, and typed callback parameters over inferred `any`. Use `unknown` at untrusted boundaries, then narrow it with parser helpers or type guards. `errorMsg(e: unknown)` in `src/hooks/useApiMutation.ts` is the preferred error-normalization helper.
- Do not introduce new `any`, unchecked JSON casts, or `as Error` assertions. These are team guidance, not ESLint-enforced rules in the current config. Existing technical-debt examples remain in `src/declarations.d.ts` (third-party force declarations), `src/pages/graph/NetworkGraphView.tsx` (force-graph integration), and dynamic translation keys such as `src/components/SmartCollectionEditor.tsx`.
- For thrown values, prefer `errorMsg` or a type guard instead of `(error as Error).message`; it handles `Error`, strings, nullish values, and other bridge payloads. Current technical debt still includes repeated `(query.error as Error).message` usage across pages such as `src/pages/AskPage.tsx`, `src/pages/CandidateInboxPage.tsx`, and `src/pages/ProjectsPage.tsx`, plus mutation callbacks typed as `Error` in import/feed pages. Treat those as migration targets, not a pattern to copy into new code. The helper and these recommendations are not enforced by the current ESLint rules.
- Keep nullable API fields explicitly nullable and preserve backend enum unions through parser functions.
- Do not duplicate or silently weaken API DTO types in a component. Update the shared type and parser together. Type assertions have narrow current uses, such as converting a controlled `<select>` value to a known union in `SmartCollectionEditor.tsx`; keep those local to a DOM boundary and validate the resulting value where needed.
- Do not use page-level `dangerouslySetInnerHTML`; the only intentional HTML injection is the centralized `MarkdownView` wrapper.
- Use `type`-only imports where appropriate; `isolatedModules` and strict unused checks are active.

## Mono Boundary (partial, `mono-core-boundaries`)

The current type organization is `src/lib/types` plus handwritten API schemas. The boundary child added stable value-type consumers under `src/core/contracts` (core domain IDs, `ResourceRefV1`, structured `ContractError`), `src/plugin-sdk/contracts` (canonical `PluginManifestV1` declarations), and `src/host/contracts` (job owner/state/event/cancellation/terminal value types). These consumers parse the canonical JSON fixtures in `.trellis/spec/cross-layer/fixtures/mono-v1/` and do not redefine schemas. Mono plugin capability DTOs and runtime grants are still planned cross-layer contracts; do not add plugin DTOs or generated Mono types until the host SDK contract is implemented and promoted.
