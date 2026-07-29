# Cross-Layer Development Guidelines

## Purpose

Index contracts that cross React, Tauri IPC, Rust, SQLite, filesystem state, build inclusion, or process startup.

## Current Rules

| Guide | Status | Load when |
| --- | --- | --- |
| [API Contracts](./api-contracts.md) | Current | Changing invoke names, arguments, DTOs, parsers, mocks, registration, or parity tests |
| [Plugin Capabilities](./plugin-capabilities.md) | Current audit plus planned boundary | Planning or implementing plugin inclusion, grants, lifecycle, storage, or contributions |
| [Reader Annotations](./reader-annotations.md) | Current audit plus planned boundary | Changing highlights, margin notes, Markdown notes, note sections, or future typed annotations |
| [Canonical Target Mono Contracts](./mono-contracts.md) | Planned, unimplemented | Implementing shared manifest, resource, authority, registry, or job fixture consumers |
| [Startup Network](./startup-network.md) | Current audit plus planned boundary | Changing app boot, updater behavior, schedules, network ownership, or zero-egress tests |
| [Performance Contracts](./performance-contracts.md) | Planned | Claiming measurable latency, memory, I/O, startup, or algorithm improvements |

Only a section labeled current is normative for product code today. Target Mono documents and `target-mono-v1` fixtures are design references until an owning implementation task promotes them.

## Source Examples

Current boundary evidence is anchored in `src/lib/apiInvoke.ts`, `src/lib/apiSchema*.ts`, `src/lib/tauriCommandParity.test.ts`, `src/test/tauriMockCommands.ts`, `src-tauri/src/commands/mod.rs`, and `src-tauri/src/storage/`.

## Validation

```bash
python3 .trellis/spec/validate.py
python3 .trellis/spec/cross-layer/fixtures/mono-v1/validate.py
python3 ./.trellis/scripts/get_context.py --mode packages
```

Use the focused validation section in the owned guide for product checks.

## Anti-Patterns

- Updating one layer of a serialized contract while leaving another stale.
- Treating a caller-provided plugin ID or manifest request as runtime authority.
- Citing target fixtures as proof that target behavior is implemented.
- Duplicating the canonical manifest, resource, authority, or job contract in another spec.

## Related Specs

- [Frontend Guidelines](../frontend/index.md)
- [Backend Guidelines](../backend/index.md)
- [Cross-Layer Thinking Guide](../guides/cross-layer-thinking-guide.md)
- [Code Reuse Thinking Guide](../guides/code-reuse-thinking-guide.md)
