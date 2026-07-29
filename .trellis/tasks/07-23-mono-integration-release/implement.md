# Validate Mono Integration Release - Implementation

## Entry Gate

- All preceding Mono children, including `mono-build-pruning`, are completed and archived.
- Validation runs on one reviewed commit/change set without resetting unrelated work.
- Canonical manifest compiler, versioned resolved-inclusion plan, provenance schema, context/execution records, and lifecycle authority contracts are approved.

## Checklist

1. [ ] Freeze reviewed commit, tool versions, supported OS/CI matrix, build profiles, plan/manifest digests, parent AC mapping, and explicit unrelated-worktree exclusions.
2. [ ] Validate Trellis children/spec promotion/completion evidence and confirm no parent contract changed without review.
3. [ ] Run typecheck, strict lint, full Vitest, production frontend build, command parity, and full relevant Cargo tests.
4. [ ] Run core-only offline/no-profile/local workflow and configured mock AI Reading/annotation/provenance E2E with process-start network, console, and error capture.
5. [ ] Run every first-party single-plugin profile, required pair, all-first-party, repeated lifecycle, broken/incompatible, permission, cancellation, and retained-data tests.
6. [ ] Run host build-profile resolver, frontend/backend included-ID and plan-digest parity, command snapshots, bundle manifest/entry/module/chunk assertions, and `cargo tree` exclusive-dependency checks.
7. [ ] Run migration prefixes `0001`-`0035`, rich libraries, included-enabled/included-disabled sidecars, excluded-owner archives, provenance table/file survival, failure injection, restore, stale-plan rejection, and second-run no-op; capture reports/checksums.
8. [ ] Run security matrix for files/symlinks, network/SSRF, secrets/logs, forged plugin IDs, stale/revoked bindings, late results after disable, context scope expansion, proposal tamper/replay/conflicts, and conversion rollback.
9. [ ] Assert explicit host-frozen context envelopes and redacted running/terminal execution records for AI/tool/network/schedule/parser/proposal/cancellation/degradation/privileged operations.
10. [ ] Run NeuInk fixed-revision reuse/branding/license/SBOM artifact scans; verify clean-room default or exact provenance ledger, Apache/NOTICE/change notices, and separate model/service compliance records.
11. [ ] Trigger the configured CI packaged/signed updater workflow on the reviewed commit and verify updater metadata/artifact consistency; do not publish.
12. [ ] Write the final verification report with one evidence record per parent criterion `AC-001` through `AC-014`, failures, residual limitations, exact artifact paths, and plan/provenance/license digests.
13. [ ] Reopen owning child for any required failure; rerun affected plus regression matrix after the fix.
14. [ ] Confirm zero unresolved P0/P1 issues and no unrelated staged changes before completing this child and then the parent.

## Validation

```bash
pnpm typecheck
pnpm lint:strict
pnpm test
pnpm build
pnpm bundle:report
(cd src-tauri && cargo test)
pnpm test:e2e
python3 ./.trellis/scripts/task.py validate .trellis/tasks/07-23-mono-integration-release
```

Use the host build resolver's matrix command and CI workflow added by prior children for profile/package evidence. Required evidence includes process-start network capture, forged/stale binding and late-result outputs, frozen context/execution records, provenance survival reports, and NeuInk compliance artifacts.

## Rollback Gates

- Any parent AC failure blocks completion and returns to its owner.
- Any migration/security/data-loss, provenance-loss, stale-plan acceptance, authority bypass, late-result publication, missing context/execution record, or NeuInk compliance signal blocks release evidence immediately.
- Do not replace missing signed CI evidence with a local unsigned release build.
- Do not bump versions, tag, publish, or stage unrelated files.

No automatic commit or release publication.
