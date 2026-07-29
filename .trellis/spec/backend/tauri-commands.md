# Tauri Commands

## Purpose

Define the current command declaration, registration, state, frontend parity, and Rust test conventions.

## Current Rules

- Command modules live under `src-tauri/src/commands/` and handlers use `#[tauri::command]`.
- `src-tauri/src/lib.rs` exposes the command surface with `.invoke_handler(commands::command_handlers!())`.
- `src-tauri/src/commands/mod.rs` is the registration owner. Its chained `command_paths_*` macros collect every path into one `tauri::generate_handler![...]`. The groups aid navigation only; they are not runtime plugins, Cargo features, or independently removable registries.
- A `pub mod` declaration does not register a command. Add the command path to the macro chain in the same change.
- Shared handlers receive `State<'_, Arc<AppState>>`. Current `AppState` contains the main SQLx pool, `LibraryPaths`, API and hardened external `reqwest` clients, one batch cancellation slot, and a sync lock.
- Keep a new handler at the IPC boundary: deserialize arguments, perform command-specific validation, delegate to a repository/domain helper, and convert the result for Tauri. Current handlers vary in strictness, so do not infer validation from the type alone. For example, `paper_set_read_status` maps unknown strings to `Unread`, while PDF path helpers reject invalid paths.
- Keep serialized argument names aligned with frontend camelCase keys. Tauri maps a Rust argument such as `paper_id` to the frontend key `paperId`; nested request objects retain their declared serialized field names.
- When a frontend wrapper invokes a command, update registration and the relevant test mock together. The current parity test is intentionally one-way: every discovered frontend invoke and every registered mock must exist in the Rust registry; it does not require every Rust command to have a frontend call or mock.

## Source Examples

- `src-tauri/src/lib.rs`: Tauri plugins, `AppState`, setup, and `command_handlers!()` installation.
- `src-tauri/src/commands/mod.rs`: command module inventory and the complete chained handler registry.
- `src-tauri/src/commands/highlights.rs`: thin repository-backed CRUD handlers returning `Result<_, String>`.
- `src-tauri/src/commands/notes.rs`: both filesystem Markdown notes and SQL note-section commands.
- `src-tauri/src/commands/papers.rs`: defaults, tracing fields, repository calls, and a network-backed metadata command.
- `src-tauri/src/commands/pdf/common.rs`: domain helpers that enforce `LibraryPaths` checks before reading managed PDFs.
- `src/lib/tauriCommandParity.test.ts`: scans non-test frontend TypeScript for literal `invoke` calls and compares names with `commands/mod.rs`.
- `src/test/tauriMockCommands.ts`: explicit test resolver map and fail-fast error for unhandled mock commands.

Rust tests are placed next to the owner. Small command/helper tests use `#[cfg(test)] mod tests` in the module, while repository tests live in module-local `tests.rs` files such as `src-tauri/src/storage/highlights/tests.rs` and `src-tauri/src/storage/papers/tests.rs`. SQL upgrade fixtures live under `src-tauri/tests/fixtures/`.

## Validation

```bash
pnpm test -- src/lib/tauriCommandParity.test.ts
cargo test --manifest-path src-tauri/Cargo.toml commands::
cargo test --manifest-path src-tauri/Cargo.toml storage::highlights::tests
```

For a new command, also search all boundary owners:

```bash
rg -n 'command_name' src src-tauri/src/commands
```

## Anti-Patterns

- Adding `#[tauri::command]` without adding its path to `command_handlers!()`.
- Assuming a macro group is an optional build slice.
- Building a command name dynamically; the current parity scan recognizes literal invoke names.
- Exposing raw `AppState`, pools, library roots, or arbitrary command dispatch to future plugin code.
- Hiding a feature in React while leaving its backend command and dependency unconditionally compiled, then claiming build removal.

## Related Specs

- [Backend Index](./index.md)
- [Storage and Migrations](./storage-and-migrations.md)
- [Error Handling](./error-handling.md)
- [Cross-Layer API Contracts](../cross-layer/api-contracts.md)
- [Plugin Capabilities](../cross-layer/plugin-capabilities.md)
