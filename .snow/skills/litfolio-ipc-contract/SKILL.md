---
name: litfolio-ipc-contract
description: Verify LitFolio Tauri IPC changes stay synchronized across Rust commands, TypeScript API wrappers, schemas/parsers, mocks, and command parity tests.
allowed-tools:
---

# LitFolio IPC Contract

## Instructions
Use this skill whenever a change crosses the React/TypeScript ↔ Rust/Tauri boundary.

1. Identify the backend command in `src-tauri/src/commands/` and ensure it is registered in `src-tauri/src/commands/mod.rs` command macros.
2. Confirm the frontend wrapper exists in `src/lib/api.ts`, `src/lib/apiLibrary.ts`, `src/lib/apiKnowledge.ts`, or `src/lib/apiAiReader.ts` as appropriate.
3. If the command returns structured data, add/update parsers in `src/lib/apiSchema.ts` and core parser helpers in `src/lib/apiSchemaCore.ts` only when needed.
4. Keep shared TypeScript types in `src/lib/types/api.ts` aligned with serialized Rust structs.
5. Update Tauri mocks in `src/test/tauriMockCommands.ts` and command parity tests in `src/lib/tauriCommandParity.test.ts`.
6. Run targeted Vitest tests, then prefer `pnpm typecheck`, `pnpm lint`, and `pnpm test` before handoff.
7. For backend behavior, run relevant Rust tests from `src-tauri` with `cargo test`.

## Checklist
- [ ] Rust command implemented and registered.
- [ ] TypeScript wrapper added/updated.
- [ ] Parser/schema/type updated for structured responses.
- [ ] Mock command fixture added/updated.
- [ ] Command parity test passes.
- [ ] Frontend and backend tests run or limitations documented.
