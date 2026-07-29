# Tauri Command Registry

## Current Registration Shape

Primary anchors:

- `src-tauri/src/lib.rs`
- `src-tauri/src/commands/mod.rs`
- `src/lib/tauriCommandParity.test.ts`
- `src/lib/apiInvoke.ts`

`src-tauri/src/lib.rs` installs Tauri runtime plugins and calls:

```rust
.invoke_handler(commands::command_handlers!())
```

`command_handlers!` starts a chain of macros in `src-tauri/src/commands/mod.rs`:

```text
command_paths_core
 -> command_paths_papers
 -> command_paths_library_taxonomy
 -> command_paths_imports_pdf
 -> command_paths_config_sync_ai
 -> command_paths_projects_research
 -> command_paths_reader_notes
 -> command_paths_feeds_discovery_graph
 -> command_paths_collections_data
 -> command_paths_alerts_concepts
 -> tauri::generate_handler![...]
```

The grouping helps source navigation but does not create runtime modules or build features. Every path ultimately enters one compile-time `generate_handler!` invocation.

## Current Cross-Domain Coupling

Examples from the chain:

- import/PDF commands share a group with jobs and network discovery;
- profile/AI commands share a group with WebDAV sync, batch AI, and Ask-session commands;
- Reader highlights/terms/translation share a group with legacy notes, supplements, query expansion, topic survey, and full-library Ask;
- feed commands share a group with graph and discovery commands;
- export/search share a group with comparisons, queue, literature review, smart collections, duplicates, and custom fields.

A frontend route toggle therefore cannot remove backend code or native dependencies.

## App State Constraint

`AppState` is a single core struct containing the main SQLx pool, `LibraryPaths`, shared HTTP clients, a batch cancellation slot, and a sync lock. Optional features currently receive the same state and can reach core storage directly through their command implementation.

The plugin target needs:

- immutable core state for core commands;
- host-owned plugin registry/state;
- plugin-scoped storage, network, secrets, jobs, and event capabilities;
- a common guard that verifies inclusion, enabled state, compatibility, and permission before plugin-attributed work;
- no raw `AppState` exposure through the public plugin SDK.

## Compile-Time and Runtime Consequences

`tauri::generate_handler!` is compile-time. Physical pruning requires conditional module compilation and conditional command-list composition through Cargo features. Runtime enable/disable remains a separate host guard and lifecycle concern.

A correct implementation distinguishes:

| Concern | Mechanism |
| --- | --- |
| code/dependency omitted from artifact | Cargo feature plus Vite inclusion manifest |
| command unavailable because plugin excluded | command not compiled/registered |
| command denied because plugin disabled | host guard returns `plugin_disabled` |
| command denied because capability missing | host guard returns `permission_denied` |
| manifest/core API mismatch | activation/guard returns `plugin_incompatible` |

## Parity and Error Contract

`src/lib/tauriCommandParity.test.ts` already provides a place to compare frontend invoke names with the Rust registry. Plugin work must extend parity checks to account for inclusion manifests rather than deleting parity coverage.

Target plugin errors are structured values with stable codes. New plugin commands must not collapse expected lifecycle/permission failures into arbitrary strings. Compatibility adapters can map structured errors for old callers during migration.

## Build Research Implications

Current `src-tauri/Cargo.toml` has only `custom-protocol` as an application feature, while plugin-exclusive crates such as `feed-rs` are unconditional. The build-pruning child must create feature ownership and verify dependency absence in core-only artifacts.

Current `vite.config.ts` has no plugin registry or conditional aliases. A generated, deterministic inclusion manifest must be consumed by both route/contribution loading and build tests. Runtime navigation filtering alone is insufficient.
