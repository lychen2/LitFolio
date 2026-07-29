# Extract Research Workbench Plugin - Design

## 1. Scope / Trigger

Extract the research workspace after the plugin host is proven. Keep the plugin independent from Library Ask so users can organize, cite evidence, compare, and write with only core paper/annotation/AI capabilities.

## 2. Signatures

```ts
type ResearchProject = {
  id: string;
  title: string;
  status: string;
  createdAt: number;
  updatedAt: number;
};

type EvidenceItem = {
  id: string;
  projectId: string;
  paperId: string;
  annotationId?: string | null;
  quote: string;
  note: string;
  unresolved: boolean;
};
```

Comparisons and writing artifacts use plugin-owned IDs and scalar core paper references. User-triggered generation calls a narrow `ai` capability with explicit prompt/context DTOs assembled from authorized papers/evidence.

Contributions own `/projects`, `/compare`, project/compare navigation, Library actions, Reader evidence actions, export formats, and job renderers.

## 3. Contracts

- The sidecar owns projects, project-paper references, evidence, comparisons, review/writing metadata, and generation checkpoints.
- Core paper/annotation content is read through capabilities at operation time. Missing references are marked unresolved and remain editable/exportable.
- Evidence created from a highlight stores a stable annotation ID plus a captured quote snapshot so later deletion does not erase evidence.
- AI work is explicit, cancellable, and records model/time/status without storing secrets.
- External project/writing files are accessed through scoped file grants; plugin-owned working files stay under its directory.
- Exports are deterministic and do not mutate core notes.
- Disable removes onboarding/routes/actions/jobs and retains drafts/checkpoints/data.

## 4. Validation & Error Matrix

| Condition | Result |
| --- | --- |
| paper/annotation missing | unresolved reference with captured content retained |
| AI profile missing | structured action-level configuration state |
| generation cancelled | checkpoint/draft preserved, no partial overwrite |
| export destination denied | `permission_denied`, no external write |
| duplicate project-paper link | idempotent existing link |
| plugin disabled | routes/actions absent and commands guarded |
| sidecar migration failure | rollback; core starts |
| Library Ask absent | all required workbench flows remain available |

## 5. Good / Base / Bad Cases

- Good: user adds a highlight as evidence, deletes the core highlight later, and the captured quote remains marked unresolved in the project/export.
- Base: no AI profile still allows manual projects, evidence, comparisons, and writing.
- Bad: an evidence row has a foreign key into `library.db` or project generation imports Ask/vector internals.

## 6. Tests Required

- Project CRUD/membership, evidence snapshot/unresolved, comparison, writing, manifest, and export tests.
- AI no-profile/cancel/retry/checkpoint and deterministic overwrite-protection tests.
- Sidecar migration for `0013`/`0029`/`0030`, writing files, idempotence, rollback, and missing references.
- Contribution/lifecycle tests, including Shell onboarding absence and Reader action cleanup.
- E2E for manual workflow, AI-assisted workflow with mock profile, disable/re-enable, and export.

## 7. Wrong vs Correct

Wrong:

```rust
FOREIGN KEY (paper_id) REFERENCES main.papers(id)
```

from a plugin sidecar.

Correct: store `paper_id` as a scalar, resolve through `ctx.papers`, and retain an evidence quote snapshot when resolution fails.
