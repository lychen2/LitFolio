# API Contracts

## Purpose

Define the current React-to-Tauri command contract across wrapper names, argument casing, runtime response parsing, Rust registration, test mocks, and parity checks.

## Current Rules

The current flow is:

```text
page/hook -> domain API wrapper -> Tauri invoke -> registered Rust command
          <- runtime parser/value <- serde result <- repository/domain code
```

- Backend command wrappers live in `src/lib/api*.ts`; WebDAV sync currently uses the separate `src/lib/syncApi.ts`. Pages and components should not invent command names or parse IPC payloads inline.
- `src/lib/apiInvoke.ts` owns `invokeParsed`: it invokes as `unknown` and calls a parser with the command name as the root error path.
- `src/lib/apiSchemaCore.ts` owns handwritten primitives for objects, arrays, nullable values, required fields, finite numbers, strings, booleans, arrays, and enum strings. `field()` checks presence only; a typed helper or nested parser must validate the value.
- New structured responses should add or reuse a shared type and parser in `src/lib/apiSchema*.ts`, then use `invokeParsed`. Current code still uses typed `invoke<T>` for primitives, `void`, and established/unparsed DTOs; generic typing alone is compile-time trust, not runtime validation.
- Frontend invoke argument objects use camelCase for Rust command parameters, for example `{ folderId }` for `folder_id` and `{ paperId }` for `paper_id`. Nested request DTOs follow their explicit serde/type shape and may use snake_case.
- A command change is atomic across the Rust handler signature and serialization, `commands/mod.rs` registration, frontend wrapper, shared type/parser when structured, Tauri test mock where the flow needs it, and focused tests.
- `src/lib/tauriCommandParity.test.ts` scans literal `invoke` calls in non-test frontend TypeScript and command paths in `commands/mod.rs`. It verifies frontend invokes and registered mocks are backed by Rust. It does not prove argument or response shape parity, parser coverage, or that every Rust command has a mock.
- `src/test/tauriMockCommands.ts` is an explicit resolver map. Unknown commands fail with the command name and registered mock list, preventing silent `undefined` behavior.

## Source Examples

- `src/lib/apiLibrary.ts`: `papers_recent` uses `invokeParsed` plus `parsePaper`; primitive `papers_count` uses `invoke<number>`.
- `src/lib/apiAiReader.ts`: current Reader/AI wrappers and camelCase arguments such as `paperId` and `targetLang`.
- `src/lib/apiKnowledge.ts`: domain wrappers for feeds, graph, projects, jobs, and note sections.
- `src/lib/syncApi.ts`: structured sync reports parsed through shared schemas.
- `src/lib/apiSchema.ts` and `src/lib/apiSchema.test.ts`: recursive DTO validation and precise invalid paths.
- `src/lib/tauriCommandParity.test.ts`: literal name parity.
- `src/test/tauriMockCommands.ts`: mock fixtures and fail-fast unknown command handling.
- `src-tauri/src/commands/mod.rs`: the current complete backend registry.

## Validation

```bash
pnpm test -- src/lib/apiSchema.test.ts src/lib/tauriCommandParity.test.ts
pnpm typecheck
rg -n 'invoke(?:Parsed)?|command_name' src/lib src/test src-tauri/src/commands
```

For a DTO change, test at least one valid value, a missing required field, a wrong primitive/enum, nullable behavior, and a nested malformed value with its exact path.

## Anti-Patterns

- Casting `unknown` in a component instead of parsing at the API owner.
- Treating `invoke<MyType>` as runtime validation.
- Adding a command wrapper without registration/parity, or adding a test mock for a command absent from Rust.
- Assuming command-name parity checks arguments, response fields, or all mocks.
- Sending Rust snake_case command parameters as top-level frontend args without confirming Tauri's camelCase mapping.

## Related Specs

- [Cross-Layer Index](./index.md)
- [Backend Tauri Commands](../backend/tauri-commands.md)
- [Backend Error Handling](../backend/error-handling.md)
- [Frontend Type Safety](../frontend/type-safety.md)
- [Canonical Target Mono Contracts](./mono-contracts.md)
