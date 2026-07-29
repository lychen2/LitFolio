# Specification Source Map

## Current Inputs

- Frontend specs exist under `.trellis/spec/frontend/` but currently contain repeated `(To be filled by the team)` markers. The prerequisite bootstrap task owns replacing them.
- Thinking guides under `.trellis/spec/guides/` are usable shared context.
- Backend and cross-layer specs were seeded during parent planning so child manifests resolve; this task owns their final source audit, corrections, links, and readiness gate.

## Backend Evidence

- `src-tauri/src/lib.rs`: Tauri builder, runtime plugins, shared `AppState`, handler registration.
- `src-tauri/src/commands/mod.rs`: command-module inventory and chained `generate_handler!` registry.
- `src-tauri/src/startup.rs`: path/pool bootstrap and migration entry.
- `src-tauri/src/storage/paths.rs`: canonical local-first paths and path-safety rules.
- `src-tauri/migrations/`: immutable SQLx migration history.
- `src-tauri/tests/` and module-local tests: integration and focused Rust test patterns.

## Cross-Layer Evidence

- `src/lib/apiInvoke.ts`: Tauri invoke wrapper.
- `src/lib/apiSchemaCore.ts` and `apiSchema.ts`: runtime response parsing.
- `src/lib/tauriCommandParity.test.ts`: frontend/backend command-name parity.
- `src/test/tauriMockCommands.ts`: frontend test command surface.
- `src/lib/error.ts`: frontend error normalization.

## Guardrail

The Mono parent `design.md` is a future contract. Specs may link it as planning context but cannot phrase its proposed directories, `pdf_notes`, sidecars, capabilities, or build features as current repository behavior.
