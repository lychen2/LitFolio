# Core Boundary Source Map

## Existing Useful Seams

- `src/lib/apiLibrary.ts`, `apiAiReader.ts`, and `apiKnowledge.ts` already indicate domain-oriented API groups.
- `src/lib/apiInvoke.ts` centralizes invoke behavior.
- `src/lib/apiSchemaCore.ts` and `apiSchema.ts` provide runtime parsing patterns.
- `src/App.tsx` already uses route-level lazy imports.
- `src/lib/navigationRegistry.ts` centralizes current static navigation.

## Current Coupling to Preserve Then Remove

- `src/lib/api.ts` remains the broad compatibility aggregation point.
- `src/components/Shell.tsx` directly queries optional topic-alert state.
- `src/components/GlobalOnboarding.tsx` directly queries projects.
- `src/components/CommandPalette.tsx` consumes all static navigation.
- Route pages own significant query/mutation and composition logic.
- `src-tauri/src/commands/mod.rs` exposes one static command surface.

## Boundary-Test Targets

- Core-to-plugin import rejection.
- Plugin-to-core-internal import rejection.
- Shared value types imported from one public owner.
- No raw `invoke` outside approved API infrastructure.
- No direct imports from route pages into other route implementations.

## Compatibility Rule

The dirty worktree includes changes in most of these files. Every implementation step must read the current version and preserve adjacent edits. Adapters are preferred to all-at-once moves because later children own semantic changes.
