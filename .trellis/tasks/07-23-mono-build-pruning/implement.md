# Prune Mono Builds - Implementation

## Entry Gate

- `mono-plugin-host-sdk` has completed and archived its canonical manifest compiler, profile resolver, and versioned resolved-inclusion output.
- All core/plugin extraction children and `mono-legacy-conversion` are completed and archived.
- Every compatibility adapter has named parity and removal evidence.

## Checklist

1. [ ] Inventory host-generated plugin entries, command modules, migrators, native/frontend dependencies, compatibility adapters, and current bundle report behavior.
2. [ ] Consume the host compiler's validated core-only, single-plugin, pair, all-first-party, invalid, mismatch, and stale resolved-plan outputs; do not introduce local manifest metadata or a second resolver.
3. [ ] Add/check generated Cargo features/optional dependencies and conditionally compile each plugin module, command registration, and runtime entry.
4. [ ] Consume generated Vite inclusion data and replace all remaining static plugin imports/routes/navigation/API registration.
5. [ ] Embed backend included-plugin IDs and plan digest; add frontend/backend set, profile, compiler, and manifest-set parity tests.
6. [ ] Extend bundle reporting to map manifests, generated entries, chunks/modules, commands, and dependencies to plugin owners and fail when excluded owners appear.
7. [ ] Add `cargo tree`/metadata assertions for plugin-exclusive dependencies while documenting legitimate shared dependencies.
8. [ ] Build/test core-only, every single plugin, interaction pairs, and all-first-party; fix only ownership/inclusion defects in this child.
9. [ ] Remove compatibility adapters, dead commands/UI/storage paths, mocks, and dependencies one owner at a time after reference/parity tests pass.
10. [ ] Re-run full source scans, locks, bundle reports, command parity, generated-registry checks, and conversion descriptor tests.
11. [ ] Add the supported matrix to CI and verify packaged/signed updater workflow configuration without running an unauthorized local release build.

## Validation

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm bundle:report
(cd src-tauri && cargo test --no-default-features --features custom-protocol)
(cd src-tauri && cargo tree --no-default-features --features custom-protocol)
python3 ./.trellis/scripts/task.py validate .trellis/tasks/07-23-mono-build-pruning
```

Use the host resolver/matrix command for all plugin profiles rather than hand-maintained command variants. Save each profile's resolved-plan digest and artifact report. Core-only evidence must list absent manifests, generated entries, frontend chunks/modules, backend commands, and exclusive dependencies.

## Rollback Gates

- Do not delete adapters until the profile containing their owner passes parity.
- Do not mark a dependency exclusive until core/shared usage is proven absent.
- Do not merge frontend/Cargo profile changes if included IDs, profile, or plan digests can diverge.
- Keep legacy conversion descriptors available in core-only builds.
- If a resolved plan is missing, stale, or inconsistent, fail before compilation/package/data open and regenerate it through the host compiler.

No version bump, tag, publication, local release package, or automatic commit.
