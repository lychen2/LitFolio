# Validate Mono Integration Release

## Goal

Produce reviewable evidence that the complete Mono architecture satisfies every parent acceptance criterion across core-only, plugin, migration, security, bundle, provenance, and release workflows.

## Dependencies

- All preceding Mono children, including `mono-build-pruning`, are completed and archived.
- Task-owned code is reviewable on a known commit/branch without resetting unrelated user work.
- The canonical manifest compiler, versioned resolved-inclusion plan, provenance schema, context/execution records, and lifecycle authority contracts are approved.

## Requirements

- Map every parent requirement/acceptance criterion to commands, test cases, build profiles, and durable evidence artifacts.
- Validate core-only offline import, library search, Reader, annotations, basic export, diagnostics, no-profile behavior, and configured mock AI Reading.
- Validate each first-party plugin independently, required interaction pairs, all-first-party, repeated enable/disable, broken/incompatible plugins, permissions, jobs, and data retention.
- Rehearse conversion from every migration-boundary fixture and representative rich legacy libraries, including rollback/failure injection, resolved-plan stale rejection, included-disabled sidecars, and excluded-plugin archives.
- Verify frontend/backend inclusion parity, command registries, bundle chunks/modules/manifests/entries, native dependency trees, and core-only artifact exclusions.
- Run TypeScript, lint, Vitest, Cargo, Playwright, bundle, security, migration, and CI packaging/updater checks using the supported matrix.
- Inspect startup logs/network for no unintended core network calls and no secret/user-content leakage.
- Verify release metadata remains coordinated across `package.json`, Tauri config, Cargo manifest/lock if a separately approved version bump occurs; this task does not bump by default.
- Run packaged signed updater/release validation in GitHub Actions, not an unauthorized local release build.
- Verify NeuInk clean-room/reuse artifacts against fixed revision `11b848e0cfe9100a0386bcf2d4f3b839148d3b99`: provenance ledger, Apache-2.0/NOTICE texts and modification notices for any reused material, branding exclusion, and artifact-level SBOM/license evidence.
- Route defects back to the owning child or revise parent contracts; do not waive required failures or hide them in the report.

## Constraints

- No new product feature or broad refactor.
- No tag, GitHub Release, version bump, or publication without separate explicit approval.
- Do not stage/commit unrelated dirty-worktree changes or clean/reset the shared tree.
- All tests use local fixtures/mock providers; no real user secrets or billable AI calls.

## Out of Scope

- Marketplace/runtime package installation.
- Long-term performance monitoring after release.
- Publishing the release itself.

## Acceptance Criteria

- [ ] AC-001 through AC-008 in the parent PRD each have passing evidence linked from a final verification report.
- [ ] Core-only, every first-party single-plugin profile, required pair, all-first-party, invalid/mismatch/stale, and broken-plugin profiles behave as designed.
- [ ] Full legacy fixture matrix converts/rolls back and rich rehearsals show no silent row/file/config loss.
- [ ] Core-only artifacts contain no excluded plugin manifests/chunks/entries/commands/exclusive dependencies and included-ID/plan-digest parity matches.
- [ ] Security tests cover permissions, path/network/secret isolation, forged identity, snapshot/restore, and log redaction.
- [ ] Full frontend/backend/E2E checks and CI packaged updater workflow pass on the reviewed commit.
- [ ] **AC-009 (CORE-011 / provenance survival):** Core-only and `document-services`-excluded evidence proves active document revisions/segments, source links, immutable snapshots, indexed backlinks, baseline Reader navigation, keyword search, and provenance-aware Markdown export remain usable; migration evidence includes provenance tables/files, counts, hashes, and unresolved-link results.
- [ ] **AC-010 (CORE-012/013 / context and proposals):** AI/tool evidence proves the host freezes explicit current-paper/selection context before dispatch, records authorized resource IDs/source hashes/budgets/truncation/warnings, rejects empty-scope widening, and requires revision/hash-bound proposals for user-content mutations with conflict/tamper/replay/disable rejection.
- [ ] **AC-011 (CORE-006/014 / zero-network and execution records):** Instrumented core-only boot and idle operation issue zero network requests, including no updater check; every permitted AI, network, schedule, parser, plugin, proposal, cancellation, degradation, and privileged failure operation has redacted running and terminal execution records.
- [ ] **AC-012 (PLUG-003/009/010 / manifest and authority):** Canonical manifests generate matching frontend/backend/build/runtime/conversion registries and plan digests; forged plugin IDs, stale/revoked bindings, unapproved hosts/redirects, secret reads, raw paths, and generic invoke are rejected with stable audited errors.
- [ ] **AC-013 (PLUG-005/011 / late-result terminality):** Disable revokes authority before cleanup; delayed callbacks, late results, retries, timers, disposer faults, and non-cooperative work cannot mutate state, publish UI, retain grants, or survive re-enable under a new generation.
- [ ] **AC-014 (reuse compliance):** Release artifact scans show no unrecorded NeuInk-derived source/assets/prompts/tests/docs or product branding. Any explicit reuse from fixed revision `11b848e0cfe9100a0386bcf2d4f3b839148d3b99` has an exact-path provenance ledger, Apache-2.0 and applicable NOTICE/change notices, replaced branding, and SBOM/license review evidence; external models/services have separate provenance/privacy decisions.
- [ ] No unresolved P0/P1 defect or required test gap remains; residual lower-risk limitations are explicitly documented.
- [ ] Unrelated user worktree changes remain intact and outside task-owned commits.

## Source Anchors

- Parent `prd.md`, `design.md`, `implement.md`, research, and all child completion evidence
- `.trellis/tasks/archive/2026-07/07-28-mono-neuink-integration-study/research/neuink-license-reuse.md`
- `.trellis/tasks/archive/2026-07/07-28-mono-neuink-integration-study/research/mono-plan-adversarial-review.md`
- `package.json`, `vite.config.ts`, `playwright.config.ts`, `scripts/bundle-report.mjs`
- `e2e/app-smoke.spec.ts`, `e2e/ui-smoke.spec.ts`, plugin/migration E2E added by children
- `src-tauri/Cargo.toml`, `Cargo.lock`, `tauri.conf.json`, `.github/workflows/`
- `src/lib/tauriCommandParity.test.ts`, plugin build resolver/reports
