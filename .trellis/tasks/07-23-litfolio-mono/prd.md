# LitFolio Mono Core and Plugin Architecture

## Goal

Upgrade the current LitFolio product in place into a smaller Mono product whose default installation is a complete local literature-reading tool: local library management, PDF Reader, PDF-anchored annotations, and user-triggered AI Reading. Non-core capabilities are delivered as removable-at-build-time and disableable-at-runtime first-party plugins. A separate long-lived "Full" product is not maintained.

Phase one also exposes a strongly typed custom-plugin API. In-app package download, signature verification, dynamic binary loading, and physical runtime uninstall are later phases.

## Confirmed Background

- The current frontend statically owns all routes and navigation entries, while the backend statically registers the full Tauri command surface.
- Reader notes currently span three persistence models: Markdown note files, structured note-section rows, and highlight-backed PDF text boxes identified by a magic label.
- Historical SQLite migrations `0001`-`0035` mix core and optional-feature data in `library.db`; shipped migration files are immutable.
- The working tree already contains extensive user changes. Mono planning and implementation must preserve unrelated edits and must not reset, clean, or overwrite them.
- NeuInk commit `11b848e0cfe9100a0386bcf2d4f3b839148d3b99` was audited as a behavior/contract reference. It is not the target plugin runtime, data model, branding, or wholesale source dependency.

## Core Requirements

- **CORE-001 - Local library:** Core MUST retain local PDF and BibTeX import, paper metadata, folders, tags, local search, basic export, and diagnostics.
- **CORE-002 - Reader:** Core MUST provide local PDF reading without requiring a network connection or an AI profile.
- **CORE-003 - Annotation model:** Core PDF annotations MUST converge on the discriminated union `PdfHighlight | PdfTextNote`. The legacy standalone note textarea and ten-card structured-note UI MUST not remain the final default presentation, but existing Markdown note content remains core-owned and preserved for the provenance-aware note workflow.
- **CORE-004 - Text-note behavior:** `PdfTextNote` MUST have its own persisted type and support create, edit, move, resize, style, delete, search, and migration. A label string on a highlight MUST NOT determine its type.
- **CORE-005 - AI Reading:** Core MUST include profile management, one active reading model, TL;DR, Quick Read, translation, terminology, highlight explanation, and questions scoped to the current paper or selected text.
- **CORE-006 - Offline startup:** Core startup and idle operation MUST NOT initiate network requests. Updater checks are not an exception: network work occurs only after an explicit user action or a persisted, independently enabled plugin schedule whose owner and next run are visible.
- **CORE-007 - AI isolation:** Missing, invalid, or disabled AI profiles MUST NOT prevent library import, search, Reader startup, or annotation workflows.
- **CORE-008 - Non-core research workflows:** Full-library RAG, embeddings, Ask sessions, topic surveys, project writing, evidence boards, graph workflows, advanced library tools, sync, Obsidian, MinerU, and network discovery MUST NOT be required by core.
- **CORE-009 - Data preservation:** Existing `note.md` files, note-section rows, historical margin notes, and plugin-owned data MUST be migrated, exported, or archived. No user data may be silently deleted.
- **CORE-010 - Replaceable frontend:** The refactor MUST establish explicit domain, data, controller, component, and extension boundaries so a later visual redesign can replace presentation code without replacing storage or domain contracts.
- **CORE-011 - Evidence provenance:** Accepted parser-neutral document revisions, stable source segments, source links, immutable snapshots, indexed backlinks, remap status, and baseline provenance export MUST be core-owned and remain usable when parser plugins are disabled or excluded.
- **CORE-012 - Explicit context:** Every AI/tool operation MUST use an immutable host-constructed context envelope containing authorized resource references, provenance, budgets, truncation, and visible scope. Empty scope MUST NOT widen to unrelated papers or the library.
- **CORE-013 - Proposal writes:** AI/tool output that changes user-authored notes, annotations, tags, metadata, accepted documents, or research artifacts MUST be reviewable as a revision/hash-bound proposal; plugins cannot directly apply these changes.
- **CORE-014 - Execution visibility:** Core MUST own persisted, redacted execution records for AI calls, plugin tools, network operations, schedules, parser jobs, proposal application, cancellation, degradation, and privileged failures.

## Plugin Requirements

- **PLUG-001 - First-party set:** Phase one MUST define `source-connectors`, `candidate-inbox`, `discovery-feeds`, `library-ask`, `research-workbench`, `knowledge-graph`, `library-plus`, `sync-integrations`, `document-services`, and `updates`. Implementation children may group closely coupled plugins, but each manifest, capability set, build entry, and data owner remains independently identifiable.
- **PLUG-002 - Extension API:** Custom plugins MUST use the typed LitFolio extension API. A local TCP port or independent-process RPC is not a plugin contract.
- **PLUG-003 - Canonical manifest:** One versioned manifest schema MUST declare identifier, version, core API range, display name, frontend/backend activation entries, dependencies, typed capability grants, UI contributions, storage/data schema, migrations, and frontend/Cargo build entries. Runtime and build registries MUST be generated from the same manifest set.
- **PLUG-004 - Least privilege:** Plugins MUST receive only granted capabilities and MUST NOT directly open `library.db`, another plugin's directory, another profile's secret, or arbitrary Tauri commands.
- **PLUG-005 - Lifecycle:** Activation MUST return or register a disposer. Disable MUST first revoke the plugin instance generation, then reject new work, cancel and bounded-drain owned jobs, remove routes/navigation/settings/Reader actions/schedules/listeners, run the disposer, close storage, and invalidate backend authority. Late completions MUST NOT mutate state or publish UI.
- **PLUG-006 - Data retention:** Runtime disable MUST preserve plugin data by default. Build-time exclusion MUST omit plugin code and plugin-only native dependencies while leaving an explicit archive/recovery path for existing data.
- **PLUG-007 - Failure isolation:** A missing, disabled, incompatible, or failed plugin MUST produce structured errors and MUST NOT block core startup.
- **PLUG-008 - Independent verification:** Each first-party plugin MUST have independent compile/include, enable/disable, storage migration, permission, and lifecycle tests.
- **PLUG-009 - Host-mediated authority:** The host MUST bind every plugin operation to an opaque live instance token resolved in Rust to immutable identity, generation, and grants. Caller-supplied plugin IDs, frontend metadata, or route ownership MUST NOT authorize an operation.
- **PLUG-010 - Typed grants:** Privileged capabilities MUST declare operation-level resource scope, limits, consent policy, redaction/audit behavior, and revocation semantics. Network redirects are revalidated and secret values never leave a host-owned adapter.
- **PLUG-011 - Terminal disable:** Disposer failure, timeout, stale token, retry timer, or late result MUST NOT preserve grants, contributions, schedules, storage handles, query updates, or state mutation after disable begins.
- **PLUG-012 - No generic execution:** Phase-one plugins MUST NOT receive process spawn, shell, TCP/local-daemon RPC, generic Tauri invoke, raw database, raw filesystem root, or secret-value access.

## Constraints

- Historical migrations `0001`-`0035` MUST remain unchanged; conversion is implemented with new migrations/converters and reversible backups.
- Core data remains under `library.db`; phase-one plugin-owned data is stored under `plugins/<plugin-id>/data.db`.
- Physical build pruning requires coordinated Cargo features and a Vite plugin manifest; a hidden route alone does not count as removal.
- A child task MUST NOT combine directory reorganization, broad visual redesign, and irreversible data migration in one change.
- Temporary compatibility adapters may exist only while old and new paths have equivalence tests.
- No child may revert or clean unrelated user worktree changes.
- NeuInk reuse defaults to clean LitFolio-native implementation. Any copied/adapted source requires pinned provenance, Apache-2.0/NOTICE compliance, prominent modification notices, and release artifact review; NeuInk branding/assets are excluded.
- V1 document candidates are normalized and accepted by core. Parser task IDs, raw provider payloads, and retry state remain plugin-owned.

## Out of Scope

- A third-party plugin marketplace or in-app package browser.
- Loading arbitrary dynamic libraries, unsigned native binaries, or independently hosted plugin processes.
- Signed runtime package installation and physical runtime uninstall.
- A complete next-generation visual redesign.
- Maintaining a second long-lived Full build beside Mono.
- V1.1 synchronized PDF/Reflow modes, generic multi-pane workspace surfaces, and a full rich-note editor; these follow only after V1 provenance and lifecycle gates pass.

## Acceptance Criteria

- **AC-001 (CORE-001, CORE-002, CORE-006):** A no-optional-plugin Mono build starts offline and completes import -> library search -> PDF open -> annotation -> basic export without a configured AI profile.
- **AC-002 (CORE-003, CORE-004):** PDF text notes use a dedicated persisted model and pass creation, editing, movement, resizing, style, deletion, search, restart-persistence, and legacy-migration tests.
- **AC-003 (CORE-005, CORE-007):** With a valid profile, every listed AI Reading action completes against the active reading model; without a profile, only those actions show a recoverable configuration state and local Reader behavior remains functional.
- **AC-004 (PLUG-001-PLUG-012):** Every first-party plugin can be included, enabled, disabled, migrated, and tested independently; disabling it removes all declared contributions, revokes authority, and cancels/drains its work while retaining its data.
- **AC-005 (CORE-009):** Fixtures covering every historical migration `0001`-`0035` convert without silent loss, produce a conversion report, and restore the pre-conversion library after an injected failure.
- **AC-006 (PLUG-006):** A core-only production artifact contains no optional-plugin page chunk and no plugin-exclusive native dependency such as feed parsing, graph rendering, WebDAV, embeddings, or document services.
- **AC-007 (CORE-010):** Import-boundary tests prevent core from importing plugin implementation modules, and `ReaderPage` is an assembly layer rather than the owner of persistence and mutation logic.
- **AC-008 (all requirements):** Parent/child integration checks, TypeScript checks, ESLint, Vitest, relevant Cargo tests, command-parity tests, and applicable Playwright smoke flows pass without resetting pre-existing worktree changes.
- **AC-009 (CORE-011):** Active document revision/segment data, source links, snapshots, backlinks, note navigation, keyword search, and provenance-aware export remain functional in a core-only build after `document-services` is disabled or excluded.
- **AC-010 (CORE-012, CORE-013):** Current-paper AI rejects unrelated refs and records frozen scope; library retrieval requires visible expansion; proposal conflict, tamper, replay, interrupted apply, disable, and permission tests never silently overwrite user content.
- **AC-011 (CORE-006, CORE-014):** Instrumented core-only startup and idle operation issue zero network requests. Every permitted AI/network/scheduled/privileged operation creates a redacted running and terminal execution record.
- **AC-012 (PLUG-003, PLUG-009, PLUG-010):** Manifest fixtures generate matching frontend/backend/build/runtime registries; forged IDs, stale tokens, unapproved hosts/redirects, secret reads, raw paths, and generic invoke are rejected with stable audited errors.
- **AC-013 (PLUG-005, PLUG-011):** Disable revokes authority before cleanup; delayed results, retries, timers, disposer faults, and non-cooperative work cannot mutate state, publish UI, or survive re-enable under a new generation.
- **AC-014 (reuse constraint):** A release contains no unrecorded NeuInk-derived source or branded asset. Any explicit reuse includes a provenance ledger, required Apache/NOTICE texts and change notices, and exact artifact-level license/SBOM evidence.
