# Cross-Layer Development Guidelines

These specs cover contracts that cross React, Tauri IPC, Rust services, SQLite, and filesystem state.

## Guides

- [API Contracts](./api-contracts.md): invoke names, arguments, parsers, mocks, and parity.
- [Plugin Capabilities](./plugin-capabilities.md): planned Mono extension boundaries, clearly marked as future until implemented.
- [Reader Annotations](./reader-annotations.md): current note sources and planned typed annotation contract.
- [Performance Contracts](./performance-contracts.md): reproducible benchmark descriptors, correctness-first gates, ownership, and rollback behavior for Mono optimizations.

For current frontend conventions, load `.trellis/spec/frontend/`. For broad reasoning, load `.trellis/spec/guides/cross-layer-thinking-guide.md`.
