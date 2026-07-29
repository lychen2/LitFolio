# LitFolio Mono Parent Execution Plan

## Purpose

The parent task owns sequencing, shared contracts, and integration acceptance. It is not the normal implementation target. Start one dependency-ready child at a time after its planning artifacts are reviewed and approved.

## Global Entry Gate

- [ ] Finish and archive `.trellis/tasks/00-bootstrap-guidelines` with source-backed frontend specs.
- [ ] Review the parent `prd.md`, `design.md`, research files, and all child plans.
- [ ] Confirm every child remains `planning`; do not run `task.py start` on the parent.
- [ ] Confirm the shared worktree snapshot and preserve unrelated modified/untracked files.
- [ ] Complete and archive `.trellis/tasks/07-28-mono-neuink-integration-study` after its parent/child plan amendments and context validation pass.

## Dependency Order

```text
00-bootstrap-guidelines
  -> mono-neuink-integration-study
    -> mono-code-spec-foundation
      -> mono-core-boundaries
        -> mono-reader-annotations
          -> mono-provenance-reading
            -> mono-ai-reading-core
              -> mono-plugin-host-sdk
                -> mono-plugin-source-discovery
                -> mono-plugin-library-ask
                -> mono-plugin-research-workbench
                -> mono-plugin-knowledge-graph
                -> mono-plugin-library-plus
                -> mono-plugin-integrations
                  -> mono-legacy-conversion
                    -> mono-build-pruning
                      -> mono-integration-release
```

`mono-ai-reading-core` can begin after core boundaries, but its annotation insertion work waits for Reader annotations and its accepted-document context waits for provenance reading. Plugin extraction children may proceed independently after the host/SDK is stable. `mono-plugin-integrations` owns separate `updates`, `sync-integrations`, and `document-services` manifests. Legacy conversion waits for all final core/plugin schemas and consumes the canonical resolved inclusion plan.

## Ordered Child Checklist

### 0. Establish Executable Specifications

- [ ] Complete `00-bootstrap-guidelines` without folding Mono target architecture into current-state specs.
- [ ] Complete and archive `mono-neuink-integration-study`; review its six pinned research reports, parent amendments, and clean-reuse decision.
- [ ] Execute `mono-code-spec-foundation` to add source-backed backend/cross-layer specifications plus canonical manifest V1, context/provenance, execution, typed grant, and lifecycle conformance fixtures.
- [ ] Gate: spec indexes resolve; current-state rules and target conformance fixtures are distinguishable; Trellis context validation passes.

### 1. Establish Core Boundaries

- [ ] Execute `mono-core-boundaries` to create dependency rules, typed core API/domain modules, minimum stable Rust domain/plugin/job contract boundaries, target directories, and compatibility adapters.
- [ ] Move or gate `startAutoUpdateCheck()` behind the removable `updates` integration contract before claiming offline startup.
- [ ] Gate: import-boundary, command-parity, structured transport, and instrumented zero-network core boot/idle tests pass before feature extraction begins.
- [ ] Rollback point: retain old imports/re-exports until every migrated caller has parity coverage.

### 2. Rebuild Core Reader, Provenance, and AI

- [ ] Execute `mono-reader-annotations` for `pdf_notes`, Reader controller separation, PDF text-note behavior, and legacy-note export support.
- [ ] Gate: backup/restore and stale-write tests pass before old margin-note writes are disabled.
- [ ] Execute `mono-provenance-reading` for accepted document revisions/segments, source links/snapshots, backlinks, revision-safe note/link saves, remapping, and provenance export.
- [ ] Gate: candidate failure rollback, deterministic remap, note/link recovery, and core-only/document-services-disabled Reader/export tests pass.
- [ ] Execute `mono-ai-reading-core` for profile/model selection, frozen explicit context, proposal-safe user-content mutations, execution records, cancellation, and current-paper/selection actions.
- [ ] Gate: offline/no-profile Reader tests and each user-triggered AI action pass; unrelated refs and implicit retrieval are rejected; Ask/Project/Topic imports are absent from core.

### 3. Build the Plugin Platform

- [ ] Execute `mono-plugin-host-sdk` in capability slices: canonical manifest compiler and static registry; opaque instance binding/reference monitor; one local UI/storage fixture; generation-safe disable and execution records; then privileged network/secret/schedule/AI capabilities behind separate contract tests.
- [ ] Gate: manifest/build/runtime registry agreement, forged/stale binding denial, activation rollback, disposer fault, real job cancellation/drain, late-result blocking, storage close, permission denial, incompatibility, and contribution cleanup tests pass.
- [ ] Rollback point: keep static route/command adapters until the fixture plugin demonstrates frontend/backend lifecycle parity and exclusion from an artifact.

### 4. Extract First-Party Plugins

- [ ] Execute `mono-plugin-source-discovery` in two independently tested slices: local zero-network `candidate-inbox`, then `source-connectors`/`discovery-feeds` with manual refresh before explicit schedules.
- [ ] Execute `mono-plugin-library-ask` for full-library RAG, typed conversations/runs, embeddings/vectors, disclosed semantic/hybrid fallback, bounded tools, and explicit retrieval scope.
- [ ] Execute `mono-plugin-research-workbench` for projects, evidence, comparisons, literature review, writing, and proposal-based mutations.
- [ ] Execute `mono-plugin-knowledge-graph` for links, concepts, citations, similarity, and graph UI with a local-only baseline.
- [ ] Execute `mono-plugin-library-plus` for queue, smart collections, custom fields, duplicates, and supplements.
- [ ] Execute `mono-plugin-integrations` for independently identifiable `updates`, `sync-integrations`, and `document-services`; network hosts, credentials, schedules, parser candidates, and data-transfer disclosures remain separate.
- [ ] Gate after each slice: core-only tests remain green; enable creates no hidden network/schedule; disable revokes authority, cancels/drains work, blocks late results, removes contributions, and retains sidecar data.
- [ ] Rollback point after each child: old static entry remains behind an adapter until plugin parity is proven.

### 5. Convert Data and Prune Builds

- [ ] Execute `mono-legacy-conversion` only after final owner schemas and the canonical manifest/inclusion compiler are stable. The converter consumes a resolved versioned inclusion plan and preserves disabled/excluded owner data without activation or loss.
- [ ] Gate: fixtures spanning migrations `0001`-`0035` convert, report provenance/ownership counts, reject stale plans, preserve archives, survive injected failure, restore the original library, and rerun without duplication.
- [ ] Execute `mono-build-pruning` to consume the canonical generated registry, feature-gate modules/dependencies, and delete proven dead compatibility paths; it must not introduce a second manifest source.
- [ ] Gate: core-only and supported plugin build matrices pass; bundle reports prove excluded manifests, entries, chunks, commands, and native dependencies are absent.

### 6. Integrate and Release

- [ ] Execute `mono-integration-release` for end-to-end flows, migration rehearsal, permission/lifecycle failures, bundle verification, and release compatibility.
- [ ] Gate: all parent acceptance criteria AC-001 through AC-014 have captured evidence; no known required work remains; user changes remain intact.
- [ ] Run release compliance gates for clean/reused NeuInk provenance, licenses/NOTICE/change markers, exact SBOM, bundled assets/models, and external-service disclosures.
- [ ] Promote only stable, implemented conventions to `.trellis/spec/` with `trellis-update-spec`.
- [ ] Commit only task-owned changes through the Trellis finish flow after explicit review; do not sweep unrelated dirty files into a commit.

## Validation Commands

Run focused commands in each child first, then the full gate at integration:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
(cd src-tauri && cargo test)
pnpm test:e2e
pnpm bundle:report
```

Trellis planning validation:

```bash
python3 ./.trellis/scripts/task.py validate .trellis/tasks/07-23-litfolio-mono
python3 ./.trellis/scripts/task.py list
python3 ./.trellis/scripts/task.py list-context .trellis/tasks/<child>
```

Child plans may narrow Cargo/E2E commands during iteration, but the integration child owns the full applicable matrix.

## Review Gates

- **Requirements gate:** No unresolved product-intent question remains in parent or child PRDs.
- **Contract gate:** Any change to parent-owned boundaries is reviewed at the parent before code continues.
- **Migration gate:** No destructive switch occurs without backup, verification, injected-failure, and restore evidence.
- **Compatibility gate:** No old entrypoint is deleted before new/old parity and dependent migration are proven.
- **Build gate:** Runtime hiding is not accepted as physical pruning; one canonical manifest set must generate matching frontend/backend/runtime/conversion registries, and artifacts must prove exclusion.
- **Authority gate:** Caller IDs and frontend metadata never grant access; only a live host-issued instance binding can authorize an operation, and disable revokes it before cleanup.
- **Context/visibility gate:** AI/retrieval scope is frozen and visible before dispatch; privileged work produces core-owned redacted running/terminal records.
- **Network gate:** Core-only startup/idle creates zero requests; network plugins require user action or a visible persisted schedule and revalidate hosts/redirects.
- **Provenance gate:** Accepted evidence remains core-readable/exportable without parser plugins; reparse, stale links, and failed note/link writes preserve snapshots and rollback state.
- **Reuse gate:** No NeuInk-derived source/asset is unrecorded; any explicit reuse passes Apache/NOTICE/change-marker and release artifact review.
- **Worktree gate:** Before and after each child, compare status for task-owned paths and verify no unrelated change was reverted.

## Parent Completion Evidence

The parent can be archived only after all 16 linked children are archived and `mono-integration-release` records evidence for AC-001 through AC-014. The parent itself should not be started merely to mark orchestration progress.
