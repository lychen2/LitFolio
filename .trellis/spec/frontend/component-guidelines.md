# Component Guidelines

> Current React component patterns in LitFolio.

## Current Pattern

Components are named function exports using React 18's JSX transform. A component normally owns rendering and small view-local state; API mutations and complex reusable behavior are extracted to hooks or `src/lib/`. `src/components/PageHeader.tsx` is a small presentational component, while `src/components/SmartCollectionEditor.tsx` demonstrates local form state plus feature-local helper components.

```tsx
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="litera-page-header">
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
      {actions && <div>{actions}</div>}
    </header>
  );
}
```

## Props Conventions

- Type props explicitly. Small components commonly use an inline object type (`PageHeader.tsx`, `TabButton.tsx`); use a named interface when the props are reused or substantial (`CandidateIdentity` in `useCandidateState.ts` is a similar local type).
- Use `ReactNode` for slots such as `title`, `icon`, `actions`, and `children` rather than accepting untyped content.
- Pass callbacks as typed functions, for example `onSave: (name: string, rules: FilterRule) => void` in `SmartCollectionEditor.tsx`.
- Keep optional props optional and provide defaults at the destructuring site when appropriate, such as `className = ""` in `PageHeader.tsx`.
- Keep feature data types in `src/lib/types/` or import them from `src/lib/api`; do not duplicate API DTO shapes in components.

## Composition and Styling

- Compose shared layout from `Shell`, `PageHeader`, `PageToolbar`, `SplitPaneLayout`, and similar components. Route pages provide feature content and actions.
- Use Tailwind utility classes and existing `litera-*` theme classes. Use `cn` from `src/lib/cn.ts` when conditional class merging is needed; `TabButton.tsx` is the concrete example.
- Use Lucide icons from `lucide-react` for interface icons. Mark decorative icons `aria-hidden="true"`; give icon-only buttons an accessible label or title.
- Use `useT()` / `useI18n()` for user-visible strings. Existing components such as `LanguageSwitcher.tsx` and `SmartCollectionEditor.tsx` do not hard-code UI copy.

## Accessibility

- Prefer semantic elements and native controls: `button`, `nav`, `main`, `header`, `label`, and headings are used throughout `Shell.tsx`, `PageHeader.tsx`, and `SearchTab.tsx`.
- Provide accessible names for icon-only or ambiguous controls. `Shell.tsx` includes a skip link and `main#main-content`; `LanguageSwitcher.tsx` uses a labeled group and button titles.
- Preserve keyboard focus styles using the existing `focus-visible` classes. Dialogs and validation messages should expose state with roles such as `role="alert"` when appropriate.
- Keep labels associated with inputs and do not use clickable non-button elements for actions.

## Common Mistakes

- Do not use page-level `dangerouslySetInnerHTML`. Markdown goes through `src/components/MarkdownView.tsx`, the one ESLint-approved wrapper.
- Do not put shared shell behavior into every page. `Shell.tsx` owns navigation, skip-link, global drop overlay, and command palette composition.
- Do not invent one-off styling systems or duplicate theme tokens; use Tailwind and existing `litera-*` classes.
- Do not leave icon-only actions without an accessible name.

## Planned Mono Boundary

The current component model is the single React app described above. Mono plugin UI composition is planned, not implemented; do not treat future plugin capability documents as current component or import conventions.
