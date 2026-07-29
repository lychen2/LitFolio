# Establish Mono Code Specifications - Implementation

## Entry Gate

- `00-bootstrap-guidelines` is completed and archived, and frontend specs contain real current-code guidance.
- Re-run this task's context validation after the prerequisite finishes.

## Checklist

1. [x] Verify `00-bootstrap-guidelines` is archived and scan frontend specs for placeholders, broken links, and unsupported claims.
2. [x] Inventory current backend command, storage, migration, error, and test patterns from the listed source anchors.
3. [x] Audit `src/main.tsx`, `src/lib/autoUpdate.ts`, and its tests; record the current boot check and periodic timer separately from the target `updates` ownership and zero-network invariant.
4. [x] Review and complete the seeded backend index/current-state documents; correct unsupported claims and run link/path checks.
5. [x] Review and complete the seeded cross-layer index/API contract covering invoke arguments, parsers, command registration, mocks, and parity tests.
6. [x] Add the canonical target `PluginManifestV1`, `MonoCanonicalJsonV1`, pinned core API compile input, surface-coherence rules, stable domain/resource/plugin/job catalog, and versioned JSON conformance fixtures; include valid, invalid, registry-agreement, authority-ledger, consent, cancellation, sequence, and terminal-state cases.
7. [x] Add the target startup-network contract and executable test recipe for observed core boot/readiness plus 30-second idle, with frontend primitives, WebView/process resource/navigation/CSP attempts, updater transport/timer, and backend egress coverage.
8. [x] Verify all future-only documents and fixtures carry explicit current/planned status; do not promote parent target contracts as implemented rules.
9. [x] Cross-link frontend, backend, cross-layer, and thinking-guide indexes; remove duplicate manifest or contract ownership statements.
10. [x] Run placeholder, strict JSON duplicate-member, ASCII SemVer/identifier, absent-dependency, activation/build/contribution/migration coherence, pinned core API, canonical byte, operation-grammar, host admission/consent, job-progress, WebView/startup observer, ATX/Setext anchor, fixture-schema, duplicate-definition, path, context-package, and Trellis validation checks.
11. [x] Review the diff for source-backed current examples and confirm no application file changed.

## Validation

```bash
rg -n "To be filled by the team|TBD" .trellis/spec
rg -n '^(interface|type) PluginManifestV1\b' .trellis/spec .trellis/tasks/07-23-litfolio-mono .trellis/tasks/07-23-mono-plugin-host-sdk .trellis/tasks/07-23-mono-build-pruning
PYTHONDONTWRITEBYTECODE=1 python3 .trellis/spec/cross-layer/fixtures/mono-v1/validate.py
PYTHONDONTWRITEBYTECODE=1 python3 .trellis/spec/validate.py
python3 ./.trellis/scripts/get_context.py --mode packages
python3 ./.trellis/scripts/task.py validate .trellis/tasks/07-23-mono-code-spec-foundation
python3 ./.trellis/scripts/task.py list-context .trellis/tasks/07-23-mono-code-spec-foundation
python3 ./.trellis/scripts/task.py validate .trellis/tasks/07-23-mono-core-boundaries
python3 ./.trellis/scripts/task.py list-context .trellis/tasks/07-23-mono-core-boundaries
pnpm test -- src/lib/autoUpdate.test.ts
```

Run the repository's Markdown-link checker if one exists; otherwise resolve every relative link and cited path with a focused script/check recorded in task evidence.

## Rollback Gates

- After backend specs: stop if a claimed convention cannot be supported by current code.
- After cross-layer specs: stop if ownership conflicts with frontend guidance, a target fixture is presented as current behavior, or more than one contract owns `PluginManifestV1`; reconcile before proceeding.
- After fixtures: stop if a manifest input cannot deterministically produce one expected registry/inclusion result, if TypeScript/Rust target envelopes diverge, or if a job fixture permits multiple terminal outcomes or post-terminal events.
- After startup-network planning: stop if any startup egress path lacks an observer/owner or updater checks can still be described as core-owned automatic work.
- Before finish: application-source diffs are outside scope and must not be included.

Do not automatically commit or modify `00-bootstrap-guidelines`; finish this child only after its dependency is already archived.
