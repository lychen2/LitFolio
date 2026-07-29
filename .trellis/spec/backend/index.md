# Backend Development Guidelines

## Purpose

Index the current Rust/Tauri backend conventions. Load the focused guide before changing a command, persistence, path, migration, or error boundary.

## Current Rules

| Guide | Load when |
| --- | --- |
| [Tauri Commands](./tauri-commands.md) | Adding or changing a command, shared state, registration, or Rust command test |
| [Storage and Migrations](./storage-and-migrations.md) | Changing SQLite, repositories, library files, paths, backups, or migrations |
| [Error Handling](./error-handling.md) | Changing validation, error conversion, logging, cancellation, or frontend-visible failures |

These documents describe the current backend under `src-tauri/`. Planned Mono contracts are explicitly labeled and are not current implementation rules.

## Source Examples

The primary entrypoints are `src-tauri/src/lib.rs`, `src-tauri/src/commands/mod.rs`, `src-tauri/src/startup.rs`, and `src-tauri/src/storage/`.

## Validation

Run the focused commands in the owned guide. For a broad backend change, run:

```bash
python3 .trellis/spec/validate.py
cargo test --manifest-path src-tauri/Cargo.toml
pnpm test -- src/lib/tauriCommandParity.test.ts
```

## Anti-Patterns

- Treating a command module declaration as command registration.
- Editing a historical SQLx migration after it may have run in a user library.
- Presenting planned plugin sidecars, grants, or structured errors as current behavior.

## Related Specs

- [Cross-Layer API Contracts](../cross-layer/api-contracts.md)
- [Canonical Target Mono Contracts](../cross-layer/mono-contracts.md)
- [Frontend Guidelines](../frontend/index.md)
- [Cross-Layer Thinking Guide](../guides/cross-layer-thinking-guide.md)
