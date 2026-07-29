# Plugin Host Source Map

## Current Static Registries

- `src/App.tsx`: all routes are declared statically.
- `src/lib/navigationRegistry.ts`: all navigation groups/items are static.
- `src/components/CommandPalette.tsx`: navigation/actions are assembled from static data.
- `src/pages/SettingsPage.tsx` and Reader/Library pages directly import optional sections/actions.
- `src-tauri/src/commands/mod.rs`: all commands reach one compile-time handler list.

## Current State/Storage

- `src-tauri/src/lib.rs` exposes one `AppState` with the core SQLx pool, paths, HTTP clients, batch cancellation, and sync lock.
- `LibraryPaths` has no plugin directory abstraction.
- Cargo exposes no first-party feature matrix; Vite exposes no plugin inclusion registry.

## Required New Test Fixture

The fixture must be intentionally broad but have no product behavior. It should register a route, nav item, command-palette entry, settings section, Library action, Reader action/panel/decorator, export format, job renderer, event listener, cancellable job, sidecar write, and scoped file/network/secret attempts.

It must include controlled failure modes: incompatible manifest, denied permission, failed migration, throw after partial registration, duplicate contribution, and disposer throw.

## Separation From Build Pruning

This task defines inclusion metadata and conditional entry contracts. `mono-build-pruning` later proves that excluded plugin code and native dependencies are physically absent from artifacts.
