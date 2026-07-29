# Backend Error Handling

## Purpose

Document current backend/frontend error transport and the boundary rules for new Rust changes without claiming planned Mono errors are implemented.

## Current Rules

- Most current Tauri handlers return `Result<T, String>`. They convert SQLx, I/O, `anyhow`, and domain errors with `.map_err(|e| e.to_string())` or add operation context with `format!`.
- Internal modules use `anyhow::Result`, SQLx errors, or focused validation helpers. Convert only at the Tauri command boundary when practical so internal callers keep typed causes and context.
- Validate before side effects when the command owns a trust boundary. Path validation belongs in `LibraryPaths`; repository validation belongs next to persistence; provider/config validation belongs in its domain.
- Current string errors are not a stable structured protocol. Read the Rust producer, frontend caller, and tests before changing text that a UI or regression test may expose.
- Frontend bridge errors are `unknown`. `src/lib/error.ts` normalizes string, `message`, `cause`, and safe `toString()` forms, while API schema failures identify the exact response path.
- Log operation identifiers and safe metadata, not API keys, credentials, opaque future bindings, full private documents, or raw provider payloads. User-facing errors should retain an actionable operation/category while redacting secrets.
- Cancellation, missing records, invalid paths, and malformed responses are different recovery states. Do not turn an expected failure into a successful empty value unless the command contract explicitly defines absence as success.

## Source Examples

- `src-tauri/src/commands/highlights.rs`: direct repository error conversion at IPC boundaries.
- `src-tauri/src/commands/papers.rs`: command timing/context and explicit not-found/duplicate messages.
- `src-tauri/src/commands/pdf/common.rs`: `anyhow` propagation internally and warning-only best-effort indexing wrapper.
- `src-tauri/src/storage/paths.rs`: contextual path errors and precise external PDF rejections.
- `src-tauri/src/storage/jobs.rs`: current validation errors and current terminal-status behavior.
- `src/lib/error.ts`: bridge error normalization.
- `src/lib/apiSchemaCore.ts`: deterministic malformed-response paths.

Planned structured plugin, job, authority, and domain errors are owned by [Canonical Target Mono Contracts](../cross-layer/mono-contracts.md). They become current only when the implementation and conformance tests land.

## Validation

```bash
cargo test --manifest-path src-tauri/Cargo.toml
pnpm test -- src/lib/apiSchema.test.ts src/lib/autoUpdate.test.ts
```

For touched commands, search the exact error and every consumer before changing it:

```bash
rg -n 'error text|command_name' src src-tauri
```

## Anti-Patterns

- Returning raw provider responses, secret-bearing configuration, private content, SQL, or filesystem internals to the frontend.
- Swallowing a migration, write, permission, cancellation, or validation error and reporting success.
- Converting to `String` deep inside reusable storage/domain code when callers need the cause.
- Adding a second list of planned Mono error codes in this document; link to the canonical target owner.
- Claiming current `Result<T, String>` commands already provide the planned structured error envelope.

## Related Specs

- [Backend Index](./index.md)
- [Tauri Commands](./tauri-commands.md)
- [Storage and Migrations](./storage-and-migrations.md)
- [Cross-Layer API Contracts](../cross-layer/api-contracts.md)
- [Canonical Target Mono Contracts](../cross-layer/mono-contracts.md)
