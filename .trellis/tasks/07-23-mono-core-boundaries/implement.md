# Establish Mono Core Boundaries - Implementation

## Entry Gate

- `mono-code-spec-foundation` is completed and archived.
- Frontend, backend, and cross-layer spec contexts resolve and have passed their readiness checks.

## Checklist

1. [ ] Capture status/diffs for all planned paths and inventory existing aliases, route imports, API exports, schema parsers, mocks, parity tests, `startAutoUpdateCheck()`, updater timers, and other startup egress paths.
2. [ ] Add layer directories, public entrypoints, and import-boundary enforcement with failing negative fixtures.
3. [ ] Consume the canonical `PluginManifestV1` fixtures and extract minimum stable TypeScript/Rust core domain/resource, plugin declaration, and job owner/state/event/cancellation/terminal value types without adding live grants or lifecycle behavior.
4. [ ] Add cross-language conformance tests for valid/invalid manifests and domain/plugin/job fixtures; reject forged authority, sequence gaps/duplicates, multiple terminal outcomes, and post-terminal events.
5. [ ] Extract the typed command-spec/invoke foundation without changing command names or payloads, then split core library/Reader/AI API ownership one domain at a time with tested compatibility re-exports.
6. [ ] Move app boot/shell/route assembly behind `app/` entrypoints while preserving lazy routes/navigation; remove the unconditional updater boot call and timer, retaining manual Settings checks through an `updates`-owned compatibility adapter.
7. [ ] Establish `ReaderPage` as an assembly boundary; move only behavior-neutral ownership, leaving annotation and AI redesign to their children.
8. [ ] Update mocks, schemas, query callers, aliases, and parity tests atomically for each moved client.
9. [ ] Add frontend fake-time and Tauri host instrumentation for core-only cold boot/readiness plus 30-second idle; require zero egress and a positive control that proves updater/network attempts are observed.
10. [ ] Run focused tests after every contract/domain move, then full frontend validation, focused Rust conformance tests, route smoke, and zero-network gates.
11. [ ] Record remaining adapters and owning removal child; review the diff for no schema/visual/feature extraction and no duplicate manifest/registry source.

## Validation

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test -- --run src/lib/autoUpdate.test.ts
pnpm test:e2e -- --grep "library|reader|import|settings"
(cd src-tauri && cargo test <mono-contract-fixture-test> <core-boot-network-test>)
python3 ./.trellis/scripts/task.py validate .trellis/tasks/07-23-mono-core-boundaries
```

Replace angle-bracket Cargo test names with the focused tests created by this task. Use the repository's actual focused Vitest invocation if the Playwright grep syntax differs at implementation time.

## Rollback Gates

- After boundary enforcement: stop if current valid imports cannot be assigned an explicit owner without changing behavior.
- After contract fixtures: stop if TypeScript and Rust disagree, if a second manifest source appears, or if stable values leak host/database/path/secret/process authority.
- After each API domain: retain the old re-export until schema, parity, mocks, and callers pass.
- After route assembly: preserve old route entrypoints until smoke tests prove equivalent navigation and lazy loading; do not restore unconditional updater startup to obtain parity.
- Before claiming offline startup: stop if the observer positive control fails, any cold-boot/idle egress is recorded, any updater timer remains, or any network path is uninstrumented.
- No broad rename or directory move proceeds while a touched file contains unresolved user edits.

Do not remove optional pages, commands, tables, or dependencies in this task.
