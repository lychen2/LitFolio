# Extract Source, Discovery, and Candidate Plugins - Design

## 1. Scope / Trigger

Extract three host-managed plugins after the SDK fixture is stable. Preserve behavior through adapters until each route/command/data path has parity.

## 2. Signatures

```ts
interface SourceConnector {
  id: string;
  prepare(input: string): Promise<ImportDraft>;
  import(draft: ImportDraft): Promise<CorePaperRef>;
}
```

`source-connectors` contributes DOI, arXiv, and remote-search sources to `import.sources`.

`discovery-feeds` contributes `/browse`, `/feeds`, `/topic`, navigation/actions/settings, and plugin-owned job renderers. It submits network-origin findings through a public candidate producer capability.

`candidate-inbox` contributes `/candidates`, local review/seen/deduplication actions, and an inbox consumer capability. It stores local candidate state and has no network, secret, or schedule authority.

Backend commands are plugin-attributed and return typed DTOs/errors through plugin-scoped clients. Sidecars own their data; core paper IDs are stored as scalar references without cross-database foreign keys.

## 3. Contracts

- Local file/PDF/BibTeX import remains a core client and route section.
- Remote connector import creates a core paper only through the granted papers/import capability; partial plugin staging is cleaned on failure.
- Feed/alert/recommendation rows reside in `discovery-feeds/data.db`; candidate review/seen/link rows reside in `candidate-inbox/data.db`; connector credentials/settings reside in source plugin scope/secrets. The legacy converter assigns every existing table/field to one owner without cross-sidecar foreign keys.
- Discovery may detect available source contributions through the public registry but cannot import source implementation modules.
- Discovery submits a versioned `CandidateDraft` through the inbox capability using an idempotency key; it cannot mutate inbox storage or approve/import a candidate.
- Refresh/survey/import jobs include plugin owner, instance generation, cancellation token, progress, idempotency key, and host execution-record correlation ID.
- Typed network grants list operations, methods, schemes, hosts, redirect policy, quotas, consent, and revocation behavior. Typed secret grants bind an opaque secret reference to approved request fields inside the host adapter. File grants are opaque, scoped handles for user-approved or host-staged content. SSRF protections and redirect revalidation remain in the host capabilities.
- Before dispatch, the host presents and records a data-transfer disclosure covering destination, data categories/content scope, credential use, and known retention. A successful manual refresh records schedule eligibility for the exact plugin generation, endpoint policy, disclosure version, and grants; any change invalidates it.
- The host writes immutable, redacted execution events for network dispatch, jobs, retries, candidate submission, core paper import, cancellation, denial, and failure. Plugins cannot suppress, rewrite, or delete required events.
- Disable revokes the instance generation before cleanup, rejects new work, cancels jobs, removes routes/actions, and closes sidecars while retaining data. Callbacks, retries, commits, and result publication recheck generation and cancellation; stale results are discarded.

## 4. Validation & Error Matrix

| Condition | Result |
| --- | --- |
| source plugin disabled | remote source action absent; guarded command returns `plugin_disabled` |
| discovery enabled without sources | feeds/browse work; candidate import action hidden/disabled explicitly |
| candidate inbox enabled without discovery | local/imported candidates remain reviewable; no network authority is introduced |
| malformed DOI/arXiv/feed URL | typed validation error before network |
| schedule requested before manual refresh | reject with `manual_refresh_required` |
| endpoint, disclosure, or grant changed | prior schedule eligibility revoked; new manual refresh required |
| network/metadata failure | recoverable item/job error; no partial core paper |
| duplicate candidate/paper | deterministic existing-link result |
| disable during refresh | job cancelled; committed rows remain consistent |
| late callback from revoked generation | result discarded and cancellation/revocation recorded |
| sidecar migration failure | rollback and plugin failed; core starts |
| private/unsafe redirect | network capability denies request |

## 5. Good / Base / Bad Cases

- Good: a disclosed manual feed refresh writes discovery items, submits a candidate through the public inbox capability, emits host-owned execution events, and an approved candidate imports through a registered DOI connector into core.
- Base: `candidate-inbox` runs without discovery or source connectors and retains locally supplied candidates for later action.
- Bad: `FeedsPage` imports DOI ingest code directly, Discovery writes candidate sidecar tables directly, or feed commands receive the raw core SQLx pool.

## 6. Tests Required

- Manifest/contribution tests for all three plugins independently and in supported combinations.
- Existing DOI/arXiv/search/feed/candidate/topic-alert fixtures and parser tests.
- Sidecar migration, count, idempotence, and injected-failure rollback tests.
- Typed network/secret/file grant, disclosure, manual-before-schedule, SSRF/redirect, cancellation, generation, retry, duplicate, execution-record, and partial-import tests.
- Candidate producer/consumer contract tests proving local inbox use without discovery and no direct cross-sidecar access.
- Core-only local import E2E plus independent source, discovery, and candidate-inbox enable/disable E2E.
- Bundle ownership assertions recorded for later pruning.

## 7. Wrong vs Correct

Wrong:

```ts
import { importDoi } from "@/plugins/source-connectors/internal";
```

inside discovery or candidate inbox.

Correct:

```ts
const source = ctx.ui.getContribution("import.sources", "doi");
// Candidate Inbox exposes an action only when the public contribution is available.
```

Core paper creation uses `ctx.papers.importDraft`, never direct DB access.
