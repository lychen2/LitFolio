# Prune Mono Builds

## Goal

Make core-only Mono the canonical default build and prove that excluded plugins, routes, commands, chunks, manifests, generated entries, and plugin-exclusive dependencies are physically absent from artifacts.

## Dependencies

- `mono-plugin-host-sdk` has completed and archived the canonical `PluginManifestV1` compiler, profile resolver, and versioned resolved-inclusion output.
- All core/plugin extraction children and `mono-legacy-conversion` are completed and archived.
- Compatibility adapters have explicit parity/removal evidence.

## Requirements

- Consume the one canonical manifest compiler output and its versioned resolved inclusion plans. This child MUST NOT define a second manifest schema, plugin metadata source, dependency resolver, or inclusion registry.
- Use compiler-selected profiles to drive Cargo features, Vite inclusion data, backend command registration, runtime registry inputs, mocks, migration descriptors, and build reports; reject missing, malformed, stale, or frontend/backend-mismatched plans before build or data open.
- Add Cargo features for all first-party plugins and an explicit `all-first-party` compatibility profile; default application features include core only.
- Conditionally compile plugin Rust modules, Tauri command registrations, migrations/migrators, and plugin-exclusive native dependencies according to the resolved plan. Feature-neutral legacy archive descriptors remain available to conversion.
- Consume a Vite inclusion manifest that imports only selected frontend plugin entries; excluded manifests, entries, routes, commands, and modules must not be reachable through static imports.
- Embed backend included-plugin IDs and plan digest, and verify frontend/backend inclusion manifests agree byte-for-byte on profile, compiler version, manifest-set digest, and selected IDs.
- Keep runtime enable/disable for included plugins; build exclusion is a distinct unavailable state. Disabled included data remains recoverable; excluded data remains covered by conversion archives.
- Remove old static routes, global API exports, command macros, compatibility adapters, dead UI/storage code, and dependencies only after each owner passes parity.
- Extend bundle/dependency reports to assert excluded plugin manifests, page chunks/modules, backend commands, generated entries, and plugin-exclusive dependencies are absent.
- Validate core-only, each independently included plugin, required interaction pairs, all-first-party, and invalid/mismatched/stale profiles in CI.
- Preserve updater/release configuration and avoid unrelated metadata/version changes.

## Constraints

- Runtime hidden UI does not count as pruning.
- Shared dependencies used by core AI/Reader remain core even if plugins also use them; reports must distinguish exclusive from shared ownership.
- Do not perform an unsigned local release build; packaged release evidence runs in the configured GitHub Actions workflow unless explicitly authorized.
- Historical migrations `0001`-`0035` and feature-neutral conversion archive descriptors remain available even if owning plugin runtime code is excluded.

## Out of Scope

- Plugin marketplace/package installation.
- New product features or visual redesign.
- Release version bump/tag/publication.
- Replacing the host-owned manifest compiler or changing the resolved-plan schema.

## Acceptance Criteria

- [ ] Default/core-only frontend and Rust builds succeed with no optional plugin included or enabled.
- [ ] Core-only Vite output contains no optional manifest, route/plugin chunk, generated plugin entry, or statically reachable plugin module; backend registry contains no optional command.
- [ ] `cargo tree`/artifact reports exclude plugin-exclusive native dependencies and bundle reports exclude graph/feed/sync/document plugin modules where applicable.
- [ ] Each single-plugin profile and supported interaction pair builds/tests with matching frontend/backend inclusion IDs, profile/digest, and generated registry inputs.
- [ ] All-first-party profile passes compatibility and migration tests; invalid, mismatched, and stale profiles fail before packaging or user-data access with actionable errors.
- [ ] Removed adapters/dependencies have no remaining imports, command names, mocks, migrations ownership gaps, or dead tests.
- [ ] Typecheck, lint, Vitest, Cargo matrix, bundle reports, core/plugin smoke tests, and CI packaging checks pass.

## Source Anchors

- `.trellis/tasks/07-23-mono-plugin-host-sdk/{prd,design,implement}.md` canonical compiler and plan contract
- `src-tauri/Cargo.toml`, `Cargo.lock`, `src-tauri/src/lib.rs`, `commands/mod.rs`
- `src/App.tsx`, plugin entries/registry, `vite.config.ts`, `package.json`, `pnpm-lock.yaml`
- `src/lib/tauriCommandParity.test.ts`, `src/test/tauriMockCommands.ts`
- `scripts/bundle-report.mjs`, `scripts/check-playwright-browsers.mjs`
- `.github/workflows/`, `src-tauri/tauri.conf.json`
