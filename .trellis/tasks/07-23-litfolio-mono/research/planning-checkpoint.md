# Planning Checkpoint

## Saved State

- Parent `.trellis/tasks/07-23-litfolio-mono` and all 16 linked children remain `planning`; no Mono implementation task has been started.
- Parent planning now includes the NeuInk-informed V1 amendments: provenance-aware core reading, explicit context/proposals/execution records, zero-network startup, canonical manifests, host-issued plugin authority, terminal disable, and clean-reuse gates.
- Every child has a PRD, design, implementation plan, source map/research, and implementation/check context; `mono-provenance-reading` is the new V1 delivery after annotation correctness.
- Source-backed backend and cross-layer specs were seeded so manifests resolve; future Mono contracts are marked planned rather than current.
- `task.py validate` passes for the parent, NeuInk study, and provenance child after the amendments; affected child plans were individually validated by their planning subagents.
- `.trellis/tasks/00-bootstrap-guidelines` remains unchanged and `in_progress`; its frontend placeholder cleanup is still the first implementation prerequisite.
- Application source files and unrelated worktree changes were not modified or reverted by this planning continuation.

## Locked Product Decisions

- Replace the current LitFolio product in place with a Mono core; do not maintain a separate long-lived Full product.
- Core includes local library management, PDF Reader, dedicated PDF annotations, and direct AI Reading.
- AI Reading includes profiles, one active reading model, TL;DR, Quick Read, translation, terminology, highlight explanation, and current-paper or selected-text questions.
- Full-library RAG, embeddings, Ask sessions, topic survey, project writing, graph workflows, advanced library tools, sync, Obsidian, MinerU, and network discovery remain optional plugins.
- Preserve the default Markdown note surface and compatibility commands through annotation migration; replace it only after provenance-aware revision-safe note/controller parity is proven while preserving/exporting all legacy data.
- Custom plugins use typed capability/UI-extension APIs, never a local TCP port.
- Phase one supports source/build-time plugin inclusion plus runtime enable/disable; signed runtime installation and physical runtime uninstall are deferred.
- Core-only is the canonical default build; all-first-party remains an explicit compatibility/profile build.

## Remaining Gate

1. [x] User reviewed/approved the planning artifacts on 2026-07-28 and explicitly requested plan execution.
2. Complete and archive `00-bootstrap-guidelines`, replacing frontend spec placeholders with current-code guidance.
3. Revalidate manifests/specs, then explicitly start only `07-23-mono-code-spec-foundation`.
4. Continue one dependency-ready child at a time; never start the parent as an implementation task.

## Resume Point

Planning and user review are complete. Resume by completing and archiving `00-bootstrap-guidelines`; do not start a Mono code child until that prerequisite is satisfied.
