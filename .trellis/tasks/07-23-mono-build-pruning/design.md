# Prune Mono Builds - Design

## 1. Scope / Trigger

Run only after the host compiler/profile resolver and every feature owner have stable contracts, conversion is complete, and compatibility evidence exists. This child turns the host-owned resolved inclusion plan into physical build boundaries and removes migration adapters.

## 2. Inputs and Signatures

The host/SDK child owns `PluginManifestV1`, manifest validation, dependency resolution, and plan generation. Build pruning consumes its immutable generated output; it does not redefine the metadata example below or resolve plugin IDs independently.

```ts
type ResolvedBuildPlanV1 = {
  planSchemaVersion: number;
  compilerVersion: string;
  profileId: string;
  profileDigest: string;
  manifestSchemaVersion: number;
  manifestSetDigest: string;
  includedPlugins: Array<{
    id: string;
    version: string;
    frontendEntry?: string;
    rustFeature?: string;
    commandSlice?: string;
    exclusiveDependencies: string[];
  }>;
  excludedPlugins: Array<{ id: string; manifestDigest: string }>;
};
```

The build resolver emits a frontend inclusion file, Cargo feature arguments, backend command slices, runtime/mock/conversion registry inputs, and the plan digest from this same output. Every generated artifact carries `planSchemaVersion`, `profileId`, `profileDigest`, and `manifestSetDigest`.

Cargo features are generated/checked from the plan rather than hand-authored here:

```toml
[features]
default = ["custom-protocol"]
# plugin-* and all-first-party are generated from canonical manifests
```

## 3. Contracts

- Core-only is the default plugin set; `custom-protocol` remains a platform concern, not a feature plugin.
- Plugin frontend entries are imported only from generated inclusion data. Core modules never statically import plugin implementations or excluded manifests.
- Plugin Rust modules/commands/migrators use compiler-selected `cfg(feature = ...)`; optional crates use generated/validated `optional = true` and matching `dep:` features.
- Historical conversion knowledge remains available through a feature-neutral archive/schema descriptor generated from canonical manifests, as specified by the conversion child.
- Included but disabled plugins remain compiled and are runtime-guarded. Excluded plugins are absent and report `unavailable`, not `disabled`.
- Frontend/backend set, profile, compiler, and manifest digest mismatch fails at build/startup tests before user data opens.
- Bundle reports must prove absence of excluded manifest files, generated frontend entries, static imports, route/action registrations, Rust command slices, and exclusive dependencies, not merely hidden UI.
- Adapter/dead-code deletion follows reference/parity tests and cannot precede it.

## 4. Validation & Error Matrix

| Condition | Result |
| --- | --- |
| unknown profile/plugin ID | host resolver failure before build |
| missing required plugin | host resolver dependency error |
| missing/stale resolved plan | build-plan failure before compilation/data open |
| frontend/Cargo/runtime plan mismatch | build/parity failure |
| excluded manifest or static import | bundle/import-boundary failure |
| excluded generated entry/route/action | generated-registry failure |
| excluded command registered | command-registry test failure |
| exclusive dependency in core tree/bundle | artifact assertion failure |
| shared dependency remains | allowed when documented as core/shared |
| legacy converter cannot identify excluded owner | build/integration failure; retain neutral descriptor |
| adapter still referenced | dead-code removal blocked |

## 5. Good / Base / Bad Cases

- Good: core-only build contains Library/Reader/AI core, no optional manifest, Graph chunk, feed commands, or `feed-rs`; all-first-party includes every resolved manifest with matching plan digests.
- Base: Library Plus builds without document-services and simply lacks its manifest, entries, commands, exclusive dependencies, and runtime contribution while core provenance remains available.
- Bad: all plugin pages remain in a static `App.tsx` registry and are merely filtered by `enabled`, or a build task maintains a second plugin metadata table.

## 6. Tests Required

- Consume host resolver schema/profile/dependency/stale-plan snapshots without duplicating resolver tests.
- TypeScript import-boundary and Vite chunk/module/manifest/entry assertions per excluded plugin.
- Rust `cargo check/test` feature matrix, command registry snapshots, and `cargo tree` exclusive-dependency assertions.
- Core-only, each single-plugin, source+discovery, library-plus+document-services, and all-first-party smoke builds.
- Core-only/applicable Playwright smoke plus plugin lifecycle tests.
- CI packaged build/updater artifact checks under existing signing workflow, not unsigned local release packaging.

## 7. Wrong vs Correct

Wrong:

```ts
const routes = ALL_PLUGIN_ROUTES.filter((route) => enabled.has(route.plugin));
```

`ALL_PLUGIN_ROUTES` still statically imports all entries, and a local build list can diverge from the host manifest compiler.

Correct: generated inclusion code contains dynamic imports only for selected plugin entry modules, Cargo compiles only matching command modules/features, excluded manifest/entry/command/dependency assertions pass, and all artifacts carry the same resolved-plan digest.
