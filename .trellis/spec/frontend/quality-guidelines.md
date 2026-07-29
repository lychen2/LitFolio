# Quality Guidelines

> Current frontend quality, testing, and accessibility rules.

## Required Checks

The project scripts define the normal validation commands:

```bash
pnpm typecheck       # tsc --noEmit
pnpm lint            # package script: eslint src --ext .ts,.tsx
pnpm lint:strict     # same lint with --max-warnings=0
pnpm test            # vitest run
pnpm test:e2e        # Playwright browser check and tests
```

The package script targets only `src` TypeScript/TSX files. `eslint.config.js` attaches the TypeScript/React rules to `src/**/*.{ts,tsx}`, while the leading `js.configs.recommended` entry is not file-scoped and can report JavaScript/MJS files when ESLint is invoked over the repository root. A lint report naming files such as `docs/manual/capture/*.mjs`, `scripts/*.mjs`, or `.pi/extensions/trellis/index.ts` therefore came from a broader `eslint .`-style invocation or a runner that did not preserve the package script's `src` target; it is not the same scope as the frontend lint script. In this workspace, direct `pnpm exec eslint src --ext .ts,.tsx` passes, while broad root lint reproduces those non-frontend reports. Do not change product/config files to address that scope discrepancy; capture the exact command and working directory first.

Run focused tests while editing, then run `pnpm typecheck`, `pnpm lint`, and `pnpm test` for substantial frontend changes. Vite config excludes `e2e`, build output, dependencies, and Rust targets from Vitest; E2E files belong in `e2e/` and are run by Playwright.

## Forbidden Patterns

- Page-level `dangerouslySetInnerHTML` is blocked by `eslint.config.js`; render Markdown through `src/components/MarkdownView.tsx`.
- Do not leave unused locals or parameters. TypeScript and ESLint enforce unused checks; prefix an intentionally unused parameter with `_` when the configured rule permits it.
- Do not violate React Hooks rules. `rules-of-hooks` is an error and `exhaustive-deps` is enabled.
- Do not add untyped backend command data or bypass the API schema parsers for new structured responses. Backend commands belong in `src/lib/api*.ts` or `src/lib/syncApi.ts`; direct Tauri plugin calls and feature-local event subscriptions in hooks/pages are valid when they own a UI-local native workflow and clean up listeners.
- Do not regress bilingual UI behavior by adding user-visible strings outside the `src/i18n` dictionaries and translation hooks.

## Testing Requirements

Add tests near changed frontend behavior. Current tests use Vitest with `describe`/`it` and often render components to a string without a browser DOM:

- `src/components/ThemePicker.test.tsx` checks semantic radio-group output and ARIA state.
- `src/components/SmartCollectionEditor.test.tsx` checks validation output and disabled save state.
- `src/pages/pageSmoke.test.tsx` renders route pages with `StaticRouter`, `I18nProvider`, and a retry-disabled `QueryClient`.
- `src/lib/apiSchema.test.ts` checks valid DTOs and precise failures for malformed backend data.

Use the Tauri mocks in `src/test/` or `vi.mock` for IPC-dependent tests. Add Playwright coverage for user flows and responsive behavior; `e2e/ui-smoke.spec.ts` checks keyboard navigation, route visibility, no horizontal overflow at three viewports, and theme persistence.

## Accessibility

Use semantic headings, landmarks, labels, and native controls. Preserve the skip link and `main#main-content` pattern from `Shell.tsx`. Give icon-only controls an accessible name, mark decorative icons `aria-hidden`, retain visible `focus-visible` styles, and expose actionable errors with `role="alert"`. Tests should assert accessible roles/names when the behavior matters; the Playwright suite uses `getByRole` for headings, buttons, navigation, tabs, and radios.

## Code Review Checklist

- Does the change follow the current `src/` organization and use existing shared components, hooks, API wrappers, and theme classes?
- Are server reads and writes modeled with React Query and invalidated after mutations?
- Are Tauri responses parsed and shared types updated without `any` or unchecked casts?
- Are user-visible strings translated and controls keyboard- and screen-reader-accessible?
- Do focused tests cover the changed behavior, and do typecheck, lint, and Vitest pass?

## Planned Mono Boundary

Mono performance, plugin, and capability gates are planned documentation in `.trellis/spec/cross-layer/`. They are not current frontend quality requirements. Review current changes against the commands and patterns above unless a task explicitly implements and promotes a Mono contract.
