# Build Pruning Source Map

## Current Frontend

- `App.tsx` statically declares every lazy page entry. Lazy chunks reduce initial load but still make every optional route part of the build graph.
- `navigationRegistry.ts` and `CommandPalette.tsx` statically own optional navigation/actions.
- `vite.config.ts` has no plugin profile resolver.
- `package.json` includes graph rendering and all frontend code under one application package.
- `scripts/bundle-report.mjs` is the existing report hook to extend.

## Current Backend

- `commands/mod.rs` chains every command into one `generate_handler!` invocation.
- `Cargo.toml` has only `custom-protocol` as an application feature and dependencies such as `feed-rs` are unconditional.
- `lib.rs` unconditionally compiles optional feature modules and shared runtime state.

## Ownership Decision

- `mono-plugin-host-sdk` owns `PluginManifestV1`, manifest validation, dependency/profile resolution, and the versioned `ResolvedBuildPlanV1`/resolved inclusion output.
- This child consumes that output to generate/build/check frontend, Rust, runtime, mock, conversion, and artifact registries. It must not define a second metadata source or resolver.
- Every generated artifact carries plan schema, compiler version, profile, profile digest, and manifest-set digest.
- Core-only evidence must prove excluded manifests, frontend entries/routes/actions/chunks/modules, backend command slices, and exclusive dependencies are absent.
- Included-but-disabled is runtime state; excluded is physical unavailable state. Historical conversion descriptors remain feature-neutral.

## Matrix Decision

Core-only is the canonical default. Required verification profiles are core-only, one profile for every first-party plugin in the parent manifest set, source+discovery, library-plus+document-services, all-first-party, and invalid/mismatch/stale cases. The host compiler is authoritative when the parent set changes.

## Shared Dependency Caution

`reqwest`, keyring, PDF parsing, and Tauri plugins may remain core because AI Reading/local Reader uses them even when optional plugins are absent. Reports must assert only genuinely exclusive dependencies rather than force artificial duplication.
