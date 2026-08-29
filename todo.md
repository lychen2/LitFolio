# Project TODO

## Mono architecture plan

- [ ] Establish the smaller local-reading Mono product as the default build, with optional first-party capabilities delivered as plugins.
- [ ] Move direct, user-triggered AI Reading into the core without depending on library-wide Ask, retrieval, projects, topics, graph, discovery, or task orchestration. (DONE — all core actions on frozen envelope + dispatch records)
- [ ] Make core-only builds physically exclude optional routes, commands, chunks, generated entries, and plugin-only dependencies.
  - Progress: optional routes/chunks/nav entries and discovery/workbench startup queries are now profile-excluded from production frontend builds (`VITE_LITFOLIO_PROFILE=core` default); backend registry filters manifests by `LITFOLIO_PROFILE`; Cargo features now physically exclude the library-ask, discovery-feeds (incl. startup feed seeding), candidate-inbox, and knowledge-graph command modules from core builds (`tauri build --no-default-features --features custom-protocol`). Remaining: gating library-plus/sync/document-services/topic-alerts/research-workbench command modules — blocked until their embedded UI in core Library/Settings/Reader pages is extracted (`mono-plugin-*` children).
- [ ] Convert legacy library data without losing user content, configuration, keyring secrets, plugin assignments, or provenance.
- [x] Build the plugin host and SDK foundation: canonical manifest registry (`plugins/<id>/manifest.json`), opaque instance bindings + reference monitor, generation-safe enable/disable, local UI fixture wired into LibraryPage.
  - Deferred: privileged capability grants (network/secrets/schedule/AI) — build each behind contract tests when its first consumer plugin is extracted.
- [ ] Extract update, sync, document, graph, Library Ask, Library Plus, research workbench, and source/discovery capabilities into plugins.
- [ ] Validate the Mono release across core-only, plugin profiles, migration, privacy, bundle, provenance, and release workflows.

## In progress

### Profile inclusion boundary + legacy conversion foundation (2026-08-25)

- All 11 first-party plugins now have canonical `plugins/<id>/manifest.json` declarations; frontend routes resolve only through `PluginRouteHost` from profile-generated plugin entries (`scripts/generate-profile-registry.mjs`); navigation, Shell, and onboarding no longer reference excluded domains in core builds.
- Backend embeds the full manifest set and filters by the compiled `LITFOLIO_PROFILE`; `pnpm tauri:build` defaults to core-only.
- `src-tauri/src/legacy_conversion.rs` adds the conversion foundation: versioned resolved-inclusion plan validation (`plan_malformed/plan_profile_mismatch/plan_manifest_stale/plan_target_stale`), deterministic preview tokens, verified backups under `backups/conversion-<token>/`, sibling staging journal, and completion-marker idempotence. Per-owner data movers wait on extraction children.
- Evidence: `cargo test` 370 passed / 1 ignored; `pnpm test` 232 passed (60 files); typecheck clean; core build verified absent AskPage/BrowsePage/FeedsPage/TopicPage/GraphPage/ComparePage/CandidateInboxPage/ProjectsPage via bundle-report assertions.

### [x] Provenance-aware core reading

Make paper, annotation, generated-content, and AI-derived data traceable to stable source revisions and hashes. Preserve local-first behavior, reject stale or cross-paper references, and provide focused backend, frontend, command-parity, and end-to-end evidence.

Evidence: provenance resolution-target persistence and backlink remapping are implemented. Validation passed with `cargo test --manifest-path src-tauri/Cargo.toml` (343 passed, 1 ignored), `pnpm typecheck`, and `pnpm test` (60 test files passed).
