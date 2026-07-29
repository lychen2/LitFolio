# Plugin Capabilities

## Purpose

Separate the current no-plugin implementation from the planned Mono plugin inclusion, authority, grant, lifecycle, storage, and contribution boundary.

## Current Implementation

- There is no plugin host or public plugin SDK.
- `src/App.tsx` statically imports route chunks and declares all routes.
- `src/lib/navigationRegistry.ts` statically declares navigation groups/items; `src/components/CommandPalette.tsx` consumes that list directly.
- `src-tauri/src/commands/mod.rs` collects all commands into one compile-time handler list.
- `src-tauri/src/lib.rs` installs Tauri runtime plugins unconditionally and gives commands one shared `AppState` with the main pool, paths, HTTP clients, batch cancellation slot, and sync lock.
- `src-tauri/Cargo.toml` currently has no application plugin feature matrix, and `vite.config.ts` has no generated Mono inclusion registry. Hiding a route does not remove backend code or native/frontend dependencies.

These are current constraints, not patterns to reproduce as a target plugin design.

## Planned Parent Contract

The planned contract is defined once in [Canonical Target Mono Contracts](./mono-contracts.md) and its `target-mono-v1` fixtures. This document does not redefine `PluginManifestV1`.

- Validated manifest declarations drive one resolved inclusion plan for frontend entries, Rust features/backend slices, runtime entries, mocks, and conversion ownership.
- Requested capabilities are descriptive requests. Runtime authority comes only from an opaque, live, host-issued instance binding resolved to immutable identity, generation, and operation grants.
- Grants are operation- and resource-scoped. Quota windows, committed consumption, and in-flight reservations live in a host-owned atomic admission ledger; plugin requests never report them. Consent is admitted only from host records bound to the exact grant policy, with one-time per-use or schedule-occurrence evidence consumed atomically with quota reservation.
- No public plugin API exposes raw `AppState`, `library.db`, SQLx, library/plugin roots, secret values, generic Tauri invoke, process/shell, or sockets.
- Runtime disable revokes the generation before cleanup, rejects new work, cancels/bounded-drains jobs, removes contributions/listeners/schedules/retries, runs the disposer, closes storage, and preserves data. Late work cannot commit or publish.
- Build exclusion and runtime disable are separate states. Exclusion must omit declared frontend/backend entries and plugin-only dependencies; disable keeps code/data but removes authority and active contributions.

The parent Mono design and `mono-plugin-host-sdk` task remain the behavioral authority until implementation and conformance tests promote this target.

## Source Examples

Current: `src/App.tsx`, `src/lib/navigationRegistry.ts`, `src/components/CommandPalette.tsx`, `src-tauri/src/lib.rs`, `src-tauri/src/commands/mod.rs`, `src-tauri/Cargo.toml`, and `vite.config.ts`.

Planned authority: `.trellis/tasks/07-23-litfolio-mono/design.md`, `.trellis/tasks/07-23-mono-plugin-host-sdk/design.md`, and [Canonical Target Mono Contracts](./mono-contracts.md).

## Validation

Current audit:

```bash
rg -n 'lazy\(|NAVIGATION_ITEMS|generate_handler|invoke_handler|plugin\(' src/App.tsx src/lib/navigationRegistry.ts src-tauri/src
rg -n '^\[features\]|custom-protocol|feed-rs' src-tauri/Cargo.toml
```

Target fixture validation:

```bash
python3 .trellis/spec/cross-layer/fixtures/mono-v1/validate.py
```

## Anti-Patterns

- Claiming routes or commands are capability-guarded today.
- Using a manifest ID, route owner, frontend state, caller-provided plugin ID, quota counter, reservation, or consent/schedule claim as authority.
- Maintaining separate TypeScript, Rust, build, mock, and converter manifest definitions.
- Calling runtime hiding build pruning.
- Defining another manifest or grant schema here instead of linking the canonical owner.

## Related Specs

- [Cross-Layer Index](./index.md)
- [Canonical Target Mono Contracts](./mono-contracts.md)
- [Startup Network](./startup-network.md)
- [Backend Tauri Commands](../backend/tauri-commands.md)
- [Performance Contracts](./performance-contracts.md)
