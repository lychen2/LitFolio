# Specification Source Map

## Current Inputs

- The archived `00-bootstrap-guidelines` task replaced frontend placeholders with source-backed current guidance.
- Thinking guides under `.trellis/spec/guides/` remain shared reasoning context.
- This task audited and completed backend and cross-layer current-state specs, indexes, target-only Mono contracts, and executable conformance fixtures.

## Backend Evidence

- `src-tauri/src/lib.rs`: Tauri builder, runtime plugins, shared `AppState`, handler registration.
- `src-tauri/src/commands/mod.rs`: command-module inventory and chained `generate_handler!` registry.
- `src-tauri/src/startup.rs`: path/pool bootstrap and migration entry.
- `src-tauri/src/storage/paths.rs`: canonical local-first paths and path-safety rules.
- `src-tauri/migrations/`: immutable SQLx migration history.
- `src-tauri/tests/` and module-local tests: integration and focused Rust test patterns.

## Cross-Layer Evidence

- `src/lib/apiInvoke.ts`: Tauri invoke wrapper.
- `src/lib/apiSchemaCore.ts` and `apiSchema.ts`: runtime response parsing.
- `src/lib/tauriCommandParity.test.ts`: frontend/backend command-name parity.
- `src/test/tauriMockCommands.ts`: frontend test command surface.
- `src/lib/error.ts`: frontend error normalization.

## Target Fixture Evidence

- `.trellis/spec/cross-layer/mono-contracts.md`: sole target schema and fixture owner for `PluginManifestV1`, `MonoCanonicalJsonV1`, pinned core API compilation, stable domain/resource references, host grants/admission/consent, and job/event terminality. Parent and downstream task documents retain behavioral/compiler/build responsibilities by linking this contract instead of restating it.
- `.trellis/spec/cross-layer/startup-network.md`: current updater audit and target core-only/disabled-updates zero-egress recipe across frontend, lower-level WebView/process resource/navigation/CSP, updater, backend, and scheduler boundaries.
- `.trellis/spec/cross-layer/fixtures/mono-v1/`: versioned Unicode/canonical-byte, valid, invalid, registry, authority-ledger/consent, resource, job, error, and startup fixtures plus their validator. Registry fixtures pin dependency-first topological order, a compatible exact core API target, and `MonoCanonicalJsonV1`; startup fixtures pin one positive control per observer without an asserted unobserved count.
- `.trellis/spec/validate.py`: placeholder, link, normalized Markdown-anchor, index, source-anchor, duplicate-owner, fixture, and context-package checks.

## Validation Evidence

- Fixture validation passes for 11 `target-mono-v1` documents, 56 closed error codes, 37 manifest, 3 registry-compile, 7 authority-grant, 5 authority-request, 5 resource, 30 job, and 13 startup negative cases. The `MonoCanonicalJsonV1` registry digest is `ebf8b27ffc1ef22f58db22c23e4fb396255af7a6f14bfaa8925d980000b736ab`.
- Named probes reject non-ASCII SemVer digits/identifiers, malformed required and optional absent-dependency ranges, incoherent contribution/migration surfaces, missing/malformed/incompatible core API compile targets, duplicate JSON members, divergent escaping/NFD canonical bytes, non-integer canonical numbers, malformed declaration/grant/request operations, caller-reported quota state, concurrent over-reservation, missing per-use/invalid scheduled consent, record/event progress divergence or decrease, lower-level startup observer omissions, and error-catalog tampering.
- Full spec validation passes for 21 documents, all local links and normalized ATX/Setext H1/H2 anchors, all three package-visible spec layers, and migration anchors `0001` through `0035`.
- Foundation, core-boundaries, parent, host, build, integration, plugin, provenance, and affected archived task contexts validate. Core-boundaries lists the canonical Mono and startup-network specs in both implement and check contexts.
- `pnpm test -- src/lib/autoUpdate.test.ts` passes 51 tests. Placeholder, duplicate-owner, trailing-whitespace, and scoped diff checks pass; this completion pass changed no application source.

## Guardrail

The Mono parent `design.md` is a future contract. Specs may link it as planning context but cannot phrase its proposed directories, `pdf_notes`, sidecars, capabilities, or build features as current repository behavior.
