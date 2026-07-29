# NeuInk Integration Study Execution Plan

## Purpose

This task produces reviewed planning amendments and an implementation-ready provenance child. It does not modify LitFolio product source.

## Checklist

### 1. Pin and Audit the Reference

- [x] Pin NeuInk at `11b848e0cfe9100a0386bcf2d4f3b839148d3b99`.
- [x] Audit architecture, reading workflows, AI/search/jobs, and license/dependency reuse through independent subagents.
- [x] Perform an adversarial review against the existing Mono parent and child plans.
- [x] Validate citation targets and retain the research reports under this task.
- [x] Run the focused algorithm-efficiency audit and record complexity, ownership, evidence limits, and benchmark gates.

### 2. Confirm Product Scope

- [x] Record the user's selected two-stage scope.
- [x] Define V1 as provenance, explicit context/proposals/execution, zero-network startup, and plugin authority/manifest corrections.
- [x] Defer synchronized PDF/Reflow, generic workspace surfaces, and richer source-aware editing to V1.1.
- [x] Keep parser/retrieval/provider/process capabilities out of the Mono core.

### 3. Amend the Mono Plan

- [x] Add parent PRD requirements and acceptance criteria for source provenance, canonical manifest, host binding, typed grants, visible execution, explicit context, terminal disable, zero-network startup, and clean reuse.
- [x] Add parent design contracts for accepted document candidates, source links/backlinks, instance authority, jobs/proposals/execution, and V1/V1.1 boundaries.
- [x] Insert `mono-provenance-reading` into the parent dependency sequence after annotation correctness and before parser/Ask extraction.
- [x] Assign updater network behavior to an explicit removable integration and make schedule/network consent testable.
- [x] Ensure legacy conversion consumes a resolved manifest inclusion plan and preserves omitted/disabled plugin data.
- [x] Amend provenance, `library-ask`, and plugin-host plans with algorithm complexity and benchmark/fallback gates; do not prescribe NeuInk's vector backend.

### 4. Plan the Provenance Child

- [x] Complete `07-28-mono-provenance-reading/prd.md` with migration, degradation, export, and Reader requirements.
- [x] Complete its design for schemas, services, IPC, controller state, parser-candidate acceptance, remapping, and rollback.
- [x] Complete its implementation checklist with focused validation commands and rollback gates.
- [x] Curate implementation/check context manifests from stable Trellis specs and the research reports.
- [x] Add benchmark fixtures for indexed backlinks, normalization/remapping, atomic recovery, cancellation/progress coalescing, and Top-K RRF/incremental embeddings to their owning child plans.

### 5. Validate and Review

- [x] Run Trellis validation for this task, the provenance child, and the Mono parent.
- [x] Verify task-owned diffs are confined to `.trellis/` and no product/unrelated worktree file changed.
- [x] Review every research requirement against the PRD/design/implementation artifacts.
- [x] Present the amended architecture and execution order for explicit implementation approval before starting a code task.

## Validation Commands

```bash
python3 ./.trellis/scripts/task.py validate .trellis/tasks/archive/2026-07/07-28-mono-neuink-integration-study
python3 ./.trellis/scripts/task.py validate .trellis/tasks/07-28-mono-provenance-reading
python3 ./.trellis/scripts/task.py validate .trellis/tasks/07-23-litfolio-mono
python3 ./.trellis/scripts/task.py list-context .trellis/tasks/archive/2026-07/07-28-mono-neuink-integration-study
python3 ./.trellis/scripts/task.py list-context .trellis/tasks/07-28-mono-provenance-reading
git status --short
```

## Review Gates

- **Evidence gate:** Every adopted contract or algorithm has a source-backed rationale, stated evidence limitation, measurable threshold, and every rejected NeuInk pattern has a stated risk.
- **Ownership gate:** Disabling `document-services` or `library-ask` cannot make accepted documents, user notes, source snapshots, baseline Reader, or keyword search unusable.
- **Authority gate:** No design relies on caller-supplied plugin identity, frontend permission metadata, ambient `AppState`, raw paths, or unrestricted transport.
- **Migration gate:** No historical migration is edited and no user data is rewritten without preview, backup, verification, and rollback.
- **Reuse gate:** No NeuInk source or branded asset enters LitFolio without an explicit provenance and license decision.
- **Worktree gate:** Product code and unrelated user changes remain untouched by this study.
- **Efficiency gate:** Benchmark failure keeps the existing implementation or triggers a separately reviewed backend choice; performance goals never bypass provenance, cancellation, offline, or lifecycle guarantees.

## Rollback

These are planning-only changes. If a proposed contract is rejected, revert only the corresponding task-owned planning amendment and relink/remove the new child through `task.py`; do not reset or clean the shared worktree.
