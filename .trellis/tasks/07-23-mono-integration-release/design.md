# Validate Mono Integration Release - Design

## 1. Scope / Trigger

This is the final integration gate, not a feature implementation task. It runs on one reviewed commit after all children are archived and creates traceable evidence for parent AC-001 through AC-014.

## 2. Signatures

Evidence record:

```ts
type VerificationEvidence = {
  criterion: "AC-001" | "AC-002" | "AC-003" | "AC-004" |
             "AC-005" | "AC-006" | "AC-007" | "AC-008" |
             "AC-009" | "AC-010" | "AC-011" | "AC-012" |
             "AC-013" | "AC-014";
  profile: string;
  command: string;
  status: "passed" | "failed" | "blocked";
  commit: string;
  planSchemaVersion?: number;
  profileDigest?: string;
  manifestSetDigest?: string;
  artifact?: string;
  notes?: string;
};
```

Final report contains environment/tool versions, reviewed commit, dirty-worktree exclusions, build matrix, plan/manifest digests, test totals, migration counts/checksums, provenance table/file inventories, bundle/dependency assertions, security cases, reuse/license artifacts, known limitations, and criterion mapping.

Required profiles:

```text
core-only
one profile for every first-party plugin
source-connectors + discovery-feeds
library-plus + document-services
all-first-party
invalid/unknown profile
frontend/backend mismatch
stale resolved-inclusion plan
broken/incompatible fixture plugin
```

## 3. Contracts

- Evidence is generated from commands/artifacts, not narrative claims. Every profile artifact is bound to the reviewed commit and resolved-plan digests.
- All runs identify the exact commit and build profile. A missing or stale plan fails before build/package or app data opens.
- Real external AI/network services are replaced by deterministic local mocks/fixtures.
- Core-only boot is instrumented from process start through idle; zero network requests includes updater checks. Network evidence also covers explicit user-triggered and scheduled plugin operations.
- Migration evidence records source/target versions, owner dispositions, plan/manifest digests, provenance table/file inventories, counts/checksums, archives, backup/restore, unresolved links, and second-run result.
- Context evidence records the host-frozen resource refs, source hashes/revisions, budgets, truncation, warnings, approval/scope transition, and dispatch snapshot. Execution evidence records redacted running/terminal AI, tool, network, schedule, parser, proposal, cancellation, degradation, and privileged failure events.
- Authority evidence uses forged plugin IDs, stale/revoked bindings, and cross-generation callbacks. Late results after disable must be rejected before state/UI publication and produce no surviving grant.
- Bundle evidence names excluded owners/manifests/generated entries/modules/chunks/commands and exclusive dependencies.
- NeuInk compliance evidence names fixed revision `11b848e0cfe9100a0386bcf2d4f3b839148d3b99`, exact reused paths if any, Apache/NOTICE/change notices, branding scans, model/service decisions, and artifact SBOM/license output.
- A failing required criterion blocks completion. The defect returns to its owning child or parent planning.
- Release packaging/updater evidence runs in CI with configured signing secrets; local validation does not create an unauthorized release package.
- Shared dirty-worktree files outside the reviewed change set are not staged, reset, or used as unexplained evidence inputs.

## 4. Validation & Error Matrix

| Condition | Result |
| --- | --- |
| required command/test fails | integration task remains open; owner defect created/reopened |
| flaky test | reproduce/quarantine only with root cause and replacement evidence; no blind rerun pass |
| missing evidence artifact | criterion not passed |
| build profile or plan mismatch | fail before app data opens |
| migration count/checksum/provenance mismatch | AC-005 or AC-009 fails; no release |
| plugin leak after disable or late result | AC-004 or AC-013 fails |
| excluded manifest/entry/chunk/command/dependency present | AC-006 or AC-012 fails |
| unintended startup network | AC-001 or AC-011 fails |
| missing/fabricated context or execution record | AC-010 or AC-011 fails |
| secret/content in logs | security/release failure |
| unrecorded NeuInk reuse or missing license artifact | AC-014 fails |
| CI signing secret unavailable | packaged release evidence blocked; do not substitute unsigned local release |
| unrelated worktree diff staged | remove only task-owned staging; integration fails review gate |

## 5. Good / Base / Bad Cases

- Good: one CI run and local test suite produce criterion-linked artifacts for all profiles, migration rehearsals, provenance survival, lifecycle/security checks, and reuse/license scans on the same commit.
- Base: a documented low-risk limitation remains but no parent requirement or P0/P1 defect is open.
- Bad: report says "all good" after only running the all-first-party app, without core-only artifact exclusion, zero-network boot, provenance, authority/lifecycle, or reuse evidence.

## 6. Tests Required

- `pnpm typecheck`, strict lint, full Vitest, production frontend build, bundle report.
- Full relevant Cargo tests plus host-resolved build/command/dependency feature matrix.
- Playwright core-only, AI mock, annotation, provenance, every plugin, interaction pair, lifecycle, migration, and failure flows.
- Offline/startup network capture, console/page error, permissions, path/symlink, SSRF, forged/stale binding, late-result, secret/log redaction.
- Context freeze/scope expansion, proposal conflict/tamper/replay, execution running/terminal/redaction, and disable-generation fixtures.
- Migration prefix `0001`-`0035`, rich fixtures, included-disabled sidecars, excluded-owner archives, provenance tables/files, failure injection, restore, stale-plan rejection, and no-op rerun.
- NeuInk fixed-revision provenance/branding/license/SBOM scans and external model/service compliance checks.
- CI packaged/signed updater metadata/artifact validation under release workflow.

## 7. Wrong vs Correct

Wrong:

```md
AC-006: Passed because optional navigation items are hidden.
AC-011: Passed because no request was observed after the updater check was allowed.
```

Correct:

```md
AC-006: Core-only Vite module report contains zero plugin-owned manifests,
entries, modules, and chunks; backend command snapshot contains zero plugin
commands; cargo tree excludes all declared plugin-exclusive crates.
AC-011: Instrumented process-start-to-idle core-only boot contains zero network
requests and execution ledger artifacts contain redacted running and terminal
records for every permitted operation.
```
