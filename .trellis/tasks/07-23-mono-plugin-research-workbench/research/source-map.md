# Research Workbench Source Map

## Current Features

- `ProjectsPage.tsx` plus `src/pages/projects/`: project list/detail, weekly review, writing.
- `ComparePage.tsx`: comparison CRUD/generation.
- `LitReviewDialog.tsx`: literature review generation.
- Reader term/evidence paths can add selected material to evidence.
- Backend commands cover projects, project manifests, writing/rendering, evidence, comparisons, and literature review.

## Current Data

- `0013_comparisons.sql`: paper comparison records.
- `0029_research_projects.sql`: projects and project-paper links.
- `0030_evidence_board.sql`: evidence items linked to projects/papers/highlights.
- Writing/manifests may also use filesystem outputs and must be inventoried before schema finalization.

## Reverse Dependencies

- `GlobalOnboarding.tsx` queries projects and always shows a Projects step.
- Library/Reader surfaces import project/evidence actions directly.
- AI model selection currently uses general task assignments.

## Ownership Decision

The plugin uses core paper, annotation, AI, export, file, and job capabilities. It does not require Library Ask. Evidence stores quote snapshots so core annotation deletion does not delete user research content.
