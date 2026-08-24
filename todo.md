# Project TODO

## Mono architecture plan

- [ ] Establish the smaller local-reading Mono product as the default build, with optional first-party capabilities delivered as plugins.
- [ ] Move direct, user-triggered AI Reading into the core without depending on library-wide Ask, retrieval, projects, topics, graph, discovery, or task orchestration.
- [ ] Make core-only builds physically exclude optional routes, commands, chunks, generated entries, and plugin-only dependencies.
- [ ] Convert legacy library data without losing user content, configuration, keyring secrets, plugin assignments, or provenance.
- [ ] Build the plugin host and SDK, then extract update, sync, document, graph, Library Ask, Library Plus, research workbench, and source/discovery capabilities into plugins.
- [ ] Validate the Mono release across core-only, plugin profiles, migration, privacy, bundle, provenance, and release workflows.

## In progress

### [x] Provenance-aware core reading

Make paper, annotation, generated-content, and AI-derived data traceable to stable source revisions and hashes. Preserve local-first behavior, reject stale or cross-paper references, and provide focused backend, frontend, command-parity, and end-to-end evidence.

Evidence: provenance resolution-target persistence and backlink remapping are implemented. Validation passed with `cargo test --manifest-path src-tauri/Cargo.toml` (343 passed, 1 ignored), `pnpm typecheck`, and `pnpm test` (60 test files passed).
