# Establish Mono Core Boundaries

## Goal

Introduce enforceable app/core/feature/plugin ownership and typed API boundaries without changing user-visible behavior or moving feature data.

## Dependencies

- `mono-code-spec-foundation` is completed and archived.
- Parent core/plugin ownership and rollback contracts are approved.

## Requirements

- Establish frontend ownership for `app/`, `core/`, `features/`, `plugins/`, and `plugin-sdk/` using staged moves or adapters that preserve current routes and behavior.
- Make `ReaderPage` and other route pages assembly surfaces rather than long-term owners of data access and mutation state.
- Split the global API aggregation into explicit core/domain clients with typed request/response parsers; retain temporary compatibility re-exports until callers migrate.
- Define and enforce import rules: core cannot import plugin implementations; plugins cannot import core repositories or feature internals; shared types have an explicit owner.
- Consume the foundation's canonical `PluginManifestV1` and conformance fixtures through one public `plugin-sdk` value-type owner. Establish matching minimum TypeScript/Rust boundaries for stable core domain/resource references, plugin declarations, and host job owner/state/event/cancellation/terminal records without implementing plugin activation or privileged capabilities.
- Move the current updater bootstrap out of core app startup. Preserve manual update checking behind an explicit compatibility adapter owned for later `updates` extraction, but do not create a startup check, periodic timer, or implicit schedule.
- Add instrumented core-only cold-boot/readiness and 30-second idle coverage that observes frontend network primitives, updater transport, and backend host request adapters and fails on any attempted egress.
- Keep all current features operational during this structural task. Optional feature extraction belongs to later children.
- Keep Tauri command names, argument shapes, and frontend mocks/parity aligned while clients move.
- Preserve unrelated worktree edits and avoid broad formatting or mechanical rewrites.

## Constraints

- No database schema change or data migration.
- No plugin lifecycle/capability implementation beyond stable type/package boundaries and conformance-fixture consumers needed by later work. Manifest declarations and caller IDs are not runtime grants.
- No Reader annotation-model replacement, AI behavior change, route deletion, or visual redesign.

## Out of Scope

- Extracting a first-party plugin.
- Adding Cargo feature pruning or plugin sidecars.
- Removing compatibility adapters before all callers and tests migrate.

## Acceptance Criteria

- [ ] Automated import-boundary checks reject core-to-plugin and plugin-to-internal imports.
- [ ] Current route, navigation, command-palette, import, Reader, and settings smoke behavior remains equivalent.
- [ ] Every migrated API call uses an explicit typed client/parser and Tauri command parity/mocks remain complete.
- [ ] TypeScript and Rust conformance consumers accept the same canonical valid manifest/domain/plugin/job fixtures and reject the same invalid fixtures; no second manifest schema or registry input exists.
- [ ] Job contracts distinguish core ownership from plugin instance ownership, carry monotonic event sequence and cancellation state, allow exactly one terminal result, and expose no raw database, filesystem, secret, generic invoke, process, or socket authority.
- [ ] `main.tsx` core boot neither calls updater transport nor registers its periodic timer; manual update checking remains reachable through the explicitly named compatibility owner for `updates`.
- [ ] Instrumented core-only cold boot through Library/Reader readiness plus 30 seconds of idle records zero attempted network requests, and a positive-control fixture proves the observer fails when updater/network transport is invoked.
- [ ] `ReaderPage` has an explicit assembly boundary and no new persistence logic is added to route components.
- [ ] Compatibility adapters are documented, tested, and have named removal owners in later child plans.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, focused Playwright smoke tests, and applicable command-parity checks pass.
- [ ] No schema, migration, or unrelated user change is modified.

## Source Anchors

- `src/App.tsx`, `src/main.tsx`, `src/components/Shell.tsx`
- `src/pages/ReaderPage.tsx`, `src/pages/LibraryPage.tsx`, `src/pages/SettingsPage.tsx`
- `src/lib/api.ts`, `src/lib/apiLibrary.ts`, `src/lib/apiAiReader.ts`, `src/lib/apiKnowledge.ts`
- `src/lib/apiInvoke.ts`, `src/lib/apiSchema*.ts`, `src/lib/tauriCommandParity.test.ts`
- `src/main.tsx`, `src/lib/autoUpdate.ts`, `src/lib/autoUpdate.test.ts`
- `src/lib/navigationRegistry.ts`, `src/test/tauriMockCommands.ts`
- `eslint.config.js`, `tsconfig.json`, `vite.config.ts`
- `.trellis/spec/cross-layer/mono-contracts.md`, `startup-network.md`, and `fixtures/mono-v1/` as target conformance inputs
