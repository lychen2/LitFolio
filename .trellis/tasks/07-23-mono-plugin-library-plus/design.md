# Extract Library Plus Plugin - Design

## 1. Scope / Trigger

Extract advanced Library utilities after the host is stable. Core keeps canonical papers and invariants; the plugin owns optional metadata/workflow state and presentation.

## 2. Signatures

```ts
type SmartRule =
  | { field: "title" | "year" | "readStatus" | "tag" | "folder"; op: string; value: unknown }
  | { all: SmartRule[] }
  | { any: SmartRule[] };

type DuplicateMergePreview = {
  keepId: string;
  mergeId: string;
  affected: Record<string, number>;
  warnings: string[];
};

type Supplement = {
  id: string;
  paperId: string;
  title: string;
  relativePath: string;
  kind: string;
  note: string;
  checksum: string;
  convertedPdfRelativePath?: string | null;
};
```

The `papers` capability exposes validated query and duplicate preview/merge methods. Sidecar tables own queue, smart definitions, custom fields/values, supplement metadata, and optional scan checkpoints.

## 3. Contracts

- Smart rules are parsed/validated ASTs; plugins never send SQL fragments.
- Queue/custom-field/supplement rows store scalar paper IDs and tolerate unresolved papers.
- Duplicate scan may read bounded paper DTOs; merge executes in core transaction after explicit preview/confirmation and emits a paper-merged event for plugin reference updates.
- Supplement paths are relative to plugin storage. Imports validate files, copy atomically, and checksum before metadata commit.
- Legacy absolute/external supplement paths are copied or archived with explicit report; originals are not silently deleted.
- Document conversion is discovered through a public contribution/capability and is not a hard dependency.
- Disable cancels scans/copies, removes UI, and closes storage/files.

## 4. Validation & Error Matrix

| Condition | Result |
| --- | --- |
| invalid smart rule/operator/field | typed validation error; no query |
| SQL-like rule string | rejected by AST parser |
| missing paper | unresolved plugin row; no core failure |
| merge target changed after preview | conflict; require new preview |
| supplement path escape/symlink | `permission_denied` |
| copy/checksum failure | no metadata commit; staged file removed |
| document service absent | conversion action absent, other supplement actions work |
| disable during scan/copy | cancellation with consistent checkpoint/state |
| sidecar migration failure | rollback; core starts |

## 5. Good / Base / Bad Cases

- Good: duplicate preview lists affected records, core merges transactionally, and plugin updates queue/custom/supplement references from the merge event.
- Base: Library Plus works fully except conversion when document-services is absent.
- Bad: smart collection concatenates SQL or duplicate plugin mutates core tables directly.

## 6. Tests Required

- Smart-rule parser/field/operator/boolean nesting and query-result tests, including injection strings.
- Queue ordering, custom-field type/options/value, duplicate preview/conflict/merge-event, and supplement file tests.
- Migration of `0019`/`0020`/`0021`/`0035`, paths/checksums, unresolved papers, idempotence, and rollback.
- Permission/path traversal/symlink, atomic copy, disable cancellation, and document-service present/absent tests.
- Core-only and enabled/disabled Library E2E.

## 7. Wrong vs Correct

Wrong:

```rust
sqlx::query(&format!("SELECT * FROM papers WHERE {}", rules))
```

Correct: parse `SmartRule`, validate fields/operators, and call the host `papers.query` capability.

Wrong: plugin executes paper merge SQL. Correct: plugin requests a core preview token, confirms it, and calls core transactional merge.
