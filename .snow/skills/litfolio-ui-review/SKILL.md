---
name: litfolio-ui-review
description: Review LitFolio React UI changes for dark theme consistency, bilingual i18n, loading/error/empty states, accessibility, and PDF reader UX constraints.
allowed-tools:
---

# LitFolio UI Review

## Instructions
Use this skill for UI/component/page changes in the LitFolio frontend.

1. Confirm components follow existing React functional component and hook patterns.
2. Prefer feature-local code under `src/pages/<feature>/`; put reusable shared UI in `src/components/`.
3. Use Tailwind utilities and existing `litera` theme tokens from `tailwind.config.js`.
4. Preserve the dark visual system, spacing conventions, and typography tone already used in the app shell/pages.
5. Check all async UI for explicit loading, empty, and error states.
6. For user-facing strings, update both `src/i18n/zh.ts` and `src/i18n/en.ts`; keep keys synchronized and covered by dictionary tests.
7. Do not use page-level `dangerouslySetInnerHTML`; route Markdown/HTML display through `src/components/MarkdownView.tsx`.
8. For PDF reader work, consider narrow layouts, scroll position, highlight navigation, virtualization/performance, and keyboard/mouse interactions.
9. Add/update Vitest tests near changed logic or components; consider Playwright tests for route-sensitive flows.

## Review Checklist
- [ ] Dark theme tokens used consistently.
- [ ] Loading/empty/error states present.
- [ ] i18n dictionaries updated in both languages when needed.
- [ ] Accessibility basics checked: labels, focus, contrast, keyboard interaction.
- [ ] PDF reader edge cases considered when relevant.
- [ ] Tests added/updated or rationale documented.
