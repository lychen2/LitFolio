# Extract Library Ask Plugin - Design

## 1. Scope / Trigger

Extract full-library retrieval after the host, core AI, provenance, and core keyword-search contracts are stable. The plugin is independently useful and has no hard dependency on Research Workbench. Core AI Reading remains a fixed-command, non-agentic current-paper surface.

## 2. Signatures

```ts
type AskContextRequest = {
  refs: Array<
    | { kind: "paper"; paperId: string }
    | { kind: "tag"; tagId: string }
    | { kind: "search-result"; documentId: string; sourceHash: string }
  >;
  maxPapers: number;
  maxCharsPerDocument: number;
};

type LibraryAskRequest = {
  question: string;
  contextRequest: AskContextRequest;
  retrieval: {
    requestedMode: "keyword" | "semantic" | "hybrid";
    fallbackPolicy: "allow-keyword" | "require-requested";
    limit: number;
  };
};

type LibraryAskInput = {
  question: string;
  contextEnvelopeId: string;
  retrieval: LibraryAskRequest["retrieval"];
};

type AskContextEnvelope = {
  id: string;
  authorizedPaperIds: string[];
  refs: AskContextRequest["refs"];
  sources: Array<{
    paperId: string;
    documentId: string;
    revisionId: string;
    sourceHash: string;
    excerpt: string;
    truncated: boolean;
  }>;
  budgets: { papers: number; charsPerDocument: number };
  provenance: SourceRef[];
  warnings: StructuredWarning[];
  createdAt: string;
};

type SearchExecution = {
  requestedMode: "keyword" | "semantic" | "hybrid";
  effectiveMode: "keyword" | "semantic" | "hybrid";
  degraded: boolean;
  degradationReason?:
    | "embedding_unavailable"
    | "index_empty"
    | "index_partial"
    | "index_stale"
    | "index_failed";
  indexRevision: string;
  pendingDocumentCount: number;
  warnings: StructuredWarning[];
};

type LibraryAskResult = {
  answer: string;
  sources: AskSource[];
  execution: SearchExecution;
  answerMode: "model" | "local-search" | "empty";
  runId: string;
  executionId: string;
  contextEnvelopeId: string;
  model?: string;
};

type AskCapabilityState = {
  profile: "ready" | "missing" | "invalid";
  index: "ready" | "partial" | "empty" | "failed";
  indexed: number;
  pending: number;
};
```

Reader/current-paper actions remain in core. Opening `/ask` or choosing a library action shows the requested scope and causes the host to resolve capabilities, enforce grants/budgets, and freeze `AskContextEnvelope`. Empty scope is an explicit empty/invalid request, not authorization for every paper. A continued conversation does not union historical and current scope silently; each run references a newly approved envelope.

Core capability inputs are stable paper/document DTOs and search/read methods, never repository/pool handles. Sidecar/vector paths are plugin-scoped.

### Typed Conversation and Run State

```ts
type ConversationPart =
  | { type: "text"; markdown: string }
  | { type: "context-snapshot"; snapshotId: string }
  | { type: "source"; source: SourceRef }
  | { type: "tool-call"; call: PersistedToolCall }
  | { type: "tool-result"; result: PersistedToolResult }
  | { type: "proposal"; proposalId: string }
  | { type: "run-state"; runId: string; status: RunStatus }
  | { type: "memory"; summary: ConversationMemory }
  | { type: "error"; error: StructuredError };

type RunStatus =
  | "queued"
  | "running"
  | "cancellation-requested"
  | "cancelled"
  | "succeeded"
  | "failed"
  | "interrupted";
```

Sidecar tables store revisioned conversations, ordered messages, schema-versioned parts, runs, and plugin checkpoints. Streaming may update a draft with an expected revision; complete/cancelled/failed messages are immutable. Startup converts orphaned nonterminal runs to `interrupted` and never silently resumes network or tool work.

### Embedding Provenance

Each embedding record contains `chunkId`, `paperId`, `documentId`, `sourceHash`, accepted source revision, `chunkerId`, `chunkerVersion`, embedding provider/model/model revision, dimensions, vector format version, and creation time. Any mismatch excludes the vector, increments pending count, and requires explicit/scheduled reindexing; it is never repaired during core or plugin startup.

## 3. Contracts

- `/ask` and all Ask UI are plugin contributions.
- Retrieval can inspect only paper IDs/content in the host-frozen envelope returned by granted core capabilities and honors its budgets/pinned refs.
- Core supplies bounded keyword search and document reads. The plugin supplies semantic indexing and hybrid rank fusion; it cannot replace core FTS or require vectors for core Library search.
- Embedding and LLM network work requires explicit user action/opt-in and uses plugin-attributed AI/network/jobs capabilities.
- Every retrieval/embedding/answer/tool operation has a core-owned redacted execution record linked to the plugin instance, context envelope, job, requested/effective mode, cancellation, degradation, and one terminal result.
- Core document Markdown/FTS remains source-of-truth; plugin stores derived embeddings with complete source/chunker/provider/model/dimension provenance for invalidation.
- Sessions store project IDs as nullable opaque references. Research Workbench may resolve labels through public contributions/events when present.
- Legacy vector conversion verifies format/model metadata; incompatible files are archived, not guessed.
- Host cancellation tokens propagate through embedding, LLM, streaming, and optional tool I/O. Disable revokes the instance generation, cancels and bounded-drains work, checkpoints safe progress, closes vector/DB handles, publishes no contributions, and rejects late callbacks/commits.
- Optional bounded tools use typed, versioned input/output and host-enforced turn/call/time/output/no-progress budgets. Read tools use the frozen envelope; mutating output is proposal-only. Core AI Reading exposes none of these tools.
- Proposals carry target, evidence, base revision/hash, digest, and idempotency key. Only core apply can recheck authority/state, journal, commit, and issue a receipt.

## 4. Validation & Error Matrix

| Condition | Result |
| --- | --- |
| plugin disabled | `plugin_disabled`; no Ask UI |
| no AI profile | structured missing state; valid keyword sources/local-search remain available |
| empty index | keyword response with indexing action and disclosed degradation |
| unavailable/empty/partial/stale/failed semantic index with fallback allowed | keyword result; requested/effective mode and structured degradation shown |
| requested semantic/hybrid mode required but unavailable | structured retrieval error; no silent fallback |
| stale source/chunker/provider/model/dimensions | mark pending; do not return stale embedding silently |
| unauthorized paper ID | deny through papers capability before dispatch |
| empty or post-freeze widened scope | reject before retrieval/provider dispatch |
| answer cancelled | underlying I/O aborted, terminal `cancelled`, immutable partial/draft state remains consistent |
| startup finds running run | mark `interrupted`; do not resume network/tool work |
| mutation requested | persisted proposal; no direct user-content write |
| vector format incompatible | recoverable archive plus reindex requirement |
| project plugin absent | session remains readable with opaque project ID |
| migration failure | sidecar/vector rollback; core starts |

## 5. Good / Base / Bad Cases

- Good: user approves library scope, requests hybrid retrieval, sees effective mode/provenance, resumes a typed session, reviews any mutation proposal, then disables with running I/O cancelled and no late publication.
- Base: plugin enabled with no profile/index presents keyword/local status and does not affect core Reader AI.
- Bad: plugin reads `library.db`, scans all files directly, silently unions historical scope, or core startup opens the vector directory.

## 6. Tests Required

- Retrieval scope approval/freeze, ranking, pinned refs, history limits, source parsing, and keyword fallback/strict-mode tests.
- Embedding source/revision/chunker/provider/model/revision/dimension invalidation and vector compatibility tests.
- Typed conversation/message-part/run CRUD, expected-revision, terminal immutability, interruption, and project-reference behavior with Research Workbench absent.
- Legacy `0023`/`0034` and vector-file migration, idempotence, checksum, archive, and rollback tests.
- Host execution/cancellation tests for exactly-once terminality, redaction, disable during index/answer/tool I/O, late-result denial, and repeated enable/disable handle leaks.
- Proposal tests for no direct mutation, digest/base conflict, idempotent receipt replay, and recovery journal behavior.
- Core-only and plugin Ask E2E, including no-profile/empty-index/error/degraded/success states.

## 7. Wrong vs Correct

Wrong:

```rust
let repo = PaperDocumentRepo::new(&state.pool);
```

inside plugin code.

Correct:

```ts
const envelope = await ctx.context.freezeLibraryScope(approvedRequest);
const docs = await ctx.papers.keywordSearch({
  envelopeId: envelope.id,
  query,
  limit,
});
const result = await retriever.answer(docs);
```

The host capability enforces paper/document scope, live instance authority, attribution, execution visibility, and cancellation. The plugin cannot add papers after `freezeLibraryScope`.
