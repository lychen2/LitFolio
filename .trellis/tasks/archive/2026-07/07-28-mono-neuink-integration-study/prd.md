# Audit NeuInk for Mono Plugin Integration

## Goal

Use the fixed NeuInk reference revision `11b848e0cfe9100a0386bcf2d4f3b839148d3b99` to strengthen LitFolio Mono through clean, LitFolio-native contracts. Produce reviewed amendments and a dependency-ready provenance-reading child plan; do not copy NeuInk wholesale or modify product source in this task.

## Requirements

- **NINK-001 - Evidence-backed audit:** Record source-backed findings for NeuInk architecture, reading workflows, AI/search/jobs, algorithmic efficiency, license/reuse constraints, and Mono-plan risks against the fixed upstream revision.
- **NINK-002 - Clean integration rule:** Treat NeuInk as a behavioral and contract reference. New LitFolio code is clean-room by default. Direct source reuse is prohibited unless full upstream history and contributor/file provenance are independently reviewed; approved copied/adapted source, assets, prompts, tests, or documentation also require an Apache-2.0 provenance ledger, notices, and release review. NeuInk trademarks, logos, screenshots, and product identity are excluded.
- **NINK-003 - V1 core scope:** Amend Mono planning to add accepted `DocumentRevision` and `DocumentSegment` records, source links with immutable snapshots and indexed backlinks, explicit AI/tool context envelopes, proposal-based user-content mutations, host-owned execution records, a zero-network core-startup invariant, and enforceable plugin authority/manifest contracts.
- **NINK-004 - V1.1 deferred UX:** Keep synchronized PDF/Reflow reading, generic multi-pane workspace surfaces, full session restoration, and richer source-aware editing as a subsequent delivery after V1 provenance, lifecycle, and core-only degradation tests pass.
- **NINK-005 - Mono ownership:** Parser transport/raw parser artifacts, embeddings, semantic/hybrid retrieval, remote source discovery, schedules, credentials, and generic AI agent loops remain optional plugins. Once a normalized document revision is explicitly accepted, its segments, source links, snapshots, backlink index, baseline Reader navigation, and baseline Markdown export are core-owned.
- **NINK-006 - Host philosophy:** Preserve a pi-agent-like model: capabilities are explicit and typed; context is user-approved and frozen before dispatch; privileged work is visible and redacted; lifecycle revocation blocks late results; core starts and remains usable offline with plugins absent.
- **NINK-007 - Delivery decomposition:** Add an independently verifiable `mono-provenance-reading` child task. Amend existing child plans rather than merging provenance work into annotation migration, AI extraction, or document-service implementation.
- **NINK-008 - Measured efficiency:** Adopt NeuInk-inspired algorithms only where complexity and benchmark gates justify them: indexed backlinks, single-pass segment normalization, bounded bucket remapping, crash-atomic writes plus transactional journals, real cancellation with coalesced progress, and bounded Top-K RRF with revision-aware incremental embedding caches. Do not assume NeuInk's vector backend meets large-corpus latency goals.

## Constraints

- The repository worktree contains extensive unrelated user changes. This task must modify only `.trellis/` planning artifacts and must not reset, clean, reformat, or alter product code.
- Historical migrations `0001` through `0035` remain immutable. The provenance child must use new migrations and reversible conversion fixtures.
- Existing PDF geometry and the planned `PdfHighlight | PdfTextNote` union remain authoritative. Source anchors enrich annotations; parser-derived segment IDs never become the sole identity of a user annotation.
- `document-services` can propose parser output but cannot directly write `library.db`, core FTS, or canonical document state. Core accepts a validated staged candidate atomically.
- The V1 public plugin API exposes no raw SQLite pool, filesystem root, secret value, generic Tauri invoke, process spawn, shell, local daemon/TCP RPC, or dynamic binary loading.

## Acceptance Criteria

- [x] The six research reports cite the fixed NeuInk revision where source evidence is available and distinguish adopt, adapt, and reject decisions.
- [x] Parent Mono PRD, design, and execution plan contain testable amendments for provenance, zero-network startup, authority, canonical manifests, execution/context records, lifecycle terminality, and revised sequencing.
- [x] `mono-provenance-reading` has a PRD, design, and implementation plan that preserves core usability when `document-services` is disabled or excluded.
- [x] V1/V1.1 boundaries are explicit: V1 contains data/safety contracts; V1.1 contains synchronized Reflow/workspace/editor experience.
- [x] Direct-source reuse is blocked without independently reviewed full upstream history and contributor/file provenance; approved reuse, assets, models, and external services have stated compliance/review gates; no untracked copied NeuInk code is introduced.
- [x] Trellis task/context validation passes and the parent plan retains its existing core/plugin requirements without weakening offline or data-preservation guarantees.
- [x] Algorithm plans state complexity, target owner, failure behavior, reproducible benchmark datasets/metrics, and pass thresholds; a benchmark failure retains the existing implementation or selects a different backend.

## Decision Record

- User-selected scope: V1 delivers provenance and host-safety contracts; V1.1 delivers advanced workspace and rich editing surfaces.
- Delivery source: `07-28-mono-provenance-reading` is linked under `07-23-litfolio-mono` and cannot start before its plan and the amended shared contracts are reviewed.
- Implementation approval: on 2026-07-28 the user explicitly requested execution of the approved plan as a large LitFolio optimization/refactor. Implementation must still proceed through dependency-ready child tasks, beginning only after `00-bootstrap-guidelines` is completed and archived.

## Research Evidence

- `research/neuink-architecture-audit.md`
- `research/neuink-reading-workflows.md`
- `research/neuink-ai-search-jobs.md`
- `research/neuink-license-reuse.md`
- `research/mono-plan-adversarial-review.md`
- `research/neuink-algorithm-efficiency.md`
