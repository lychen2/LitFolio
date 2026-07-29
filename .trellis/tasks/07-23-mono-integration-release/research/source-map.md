# Integration Release Source Map

## Existing Validation Surface

- Frontend scripts: typecheck, lint/strict, Vitest, build, Playwright, bundle report.
- `e2e/app-smoke.spec.ts` and untracked `e2e/ui-smoke.spec.ts` are current smoke anchors.
- Rust module/integration tests cover storage/ingest and will be expanded by children.
- `tauriCommandParity.test.ts` checks frontend/backend command names.
- `scripts/bundle-report.mjs` is the current artifact-size hook.

## Required Evidence Owners

- Core/Reader/AI children: local/no-profile/AI mock, zero-network boot, annotations, explicit context, proposal, and execution results.
- Host/plugins: canonical manifest/plan parity, forged/stale binding, lifecycle/late-result, permission, sidecar, and E2E results.
- Legacy conversion: prefix/rich fixture reports, included-disabled sidecars, excluded archives, stale-plan rejection, provenance tables/files, and rollback.
- Build pruning: profile, excluded manifest/entry/chunk/module/command, bundle, and dependency reports.
- Release integration: criterion-linked report, fixed NeuInk revision compliance ledger, branding scan, Apache/NOTICE/change notices, SBOM/license output, and model/service decisions.

## Release Constraints

Project release rules require coordinated version changes in `package.json`, `tauri.conf.json`, `Cargo.toml`, and `Cargo.lock` only when a version bump is approved. Signed updater artifacts and `latest.json` are produced by GitHub Actions. Local release builds are not the substitute.

## Gate Set

- AC-009 proves provenance survives core-only/parser-excluded conversion and remains readable/exportable.
- AC-010 proves host-frozen explicit context and proposal-only user-content writes.
- AC-011 proves process-start zero-network core boot plus redacted running/terminal execution records.
- AC-012 proves canonical manifest/plan parity and runtime authority rejection for forged/stale bindings and undeclared grants.
- AC-013 proves disable terminality and late-result rejection across generations.
- AC-014 proves no unrecorded NeuInk reuse or branding; any reuse is exact-path and license/SBOM reviewed against commit `11b848e0cfe9100a0386bcf2d4f3b839148d3b99`.

## Worktree Constraint

The current shared tree began with extensive unrelated edits. Final evidence must identify the reviewed task commit/change set and keep unrelated paths unstaged/unreset. A clean CI checkout is authoritative for build/package reproducibility.
