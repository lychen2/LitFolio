# NeuInk AI, Search, Parser, and Job Audit for Mono

## Audit basis

- NeuInk checkout: `/tmp/litfolio-neuink-audit`
- Audited commit: `11b848e0cfe9100a0386bcf2d4f3b839148d3b99`
- LitFolio comparison target: current AI Reading implementation plus the planned `mono-ai-reading-core`, `library-ask`, and `document-services` boundaries.
- NeuInk citations below are relative to `/tmp/litfolio-neuink-audit`; LitFolio and Trellis citations are relative to the LitFolio repository root.

## Executive decision

NeuInk contains several mechanisms worth adapting, but it should not be integrated as a runtime, crate set, or general assistant architecture.

Adopt or adapt:

1. Explicit, bounded context snapshots with truncation and warnings.
2. Typed conversation parts that preserve context, sources, tool traces, run state, memory, and proposals.
3. Proposal-only AI mutations with base hashes, digests, idempotency receipts, conflict results, and recovery journals.
4. Keyword/semantic/hybrid modes with reciprocal-rank fusion and explicit keyword fallback.
5. Parser-provider normalization into one versioned document model, with stable source references.
6. Agent turn/tool budgets and cycle/no-progress guards, but only in an optional plugin tool loop.

Reject or redesign:

1. Implicitly widening empty context to every parsed document.
2. Frontend-held API keys and frontend-owned security decisions.
3. Direct model side effects such as `create_entry`.
4. Startup vector warmup and indexing.
5. In-memory jobs and cancellation that only relabels a job.
6. Parse states that claim upload completion before upload starts.
7. Untyped backend message parts and whole-file last-writer-wins conversation updates.
8. Embedding caches without model, dimensions, chunker, and source-version provenance.

This reinforces, rather than changes, Mono's main split: direct current-paper AI stays core; full-library conversations, retrieval, embeddings, tools, and skills stay in `library-ask`; remote parsing stays in `document-services`; canonical documents, local keyword search, proposal application, and the actual job runtime stay core.

## 1. Ownership classification

| Concern | Mono owner | Decision | Reason |
| --- | --- | --- | --- |
| AI profile resolution, secret access, provider call | Core AI capability | Adapt existing LitFolio | Core AI Reading already requires one active model and backend-only secrets (`.trellis/tasks/07-23-mono-ai-reading-core/design.md:L9-L23`, `L48-L56`). NeuInk exposes `api_key` in frontend settings/profile DTOs, which must not be copied (`apps/desktop/src/shared/ipc/assistantApi.ts:L18-L47`). |
| TL;DR, Quick Read, translation, terms, highlight explanation | Core AI Reading | Keep direct commands | These are deterministic, user-triggered current-paper operations, not an agent or retrieval session (`.trellis/tasks/07-23-mono-ai-reading-core/prd.md:L12-L21`). |
| Current-paper question context | Core AI Reading | Adapt NeuInk snapshot shape | NeuInk models entry, note, document, pinned segments, budgets, truncation, and warnings explicitly (`crates/neuink-ipc/src/commands/assistant.rs:L136-L196`, `L560-L567`). Core must keep the narrower one-paper boundary (`.trellis/tasks/07-23-mono-ai-reading-core/design.md:L58-L66`). |
| Canonical document Markdown, source revisions, FTS, keyword search | Core documents/search | Keep core | `library-ask` is already constrained to consume core DTOs and leave Markdown/FTS core-owned (`.trellis/tasks/07-23-mono-plugin-library-ask/design.md:L32-L44`). |
| Ask route, sessions, full-library scope, pinned papers | `library-ask` plugin | Extract | Planned ownership already includes conversations and pinned papers (`.trellis/tasks/07-23-mono-plugin-library-ask/prd.md:L12-L22`). |
| Embeddings, vector cache, semantic/hybrid ranking | `library-ask` plugin | Adapt NeuInk search concepts | Embeddings are derived, optional, and must not affect core startup. NeuInk's mode/fallback mechanics are useful, but its startup warmup is not (`crates/neuink-ipc/src/commands/search.rs:L155-L168`). |
| Ask retrieval/read tools and optional skills | `library-ask` plugin, mediated by host | Adapt narrowly | Tool descriptors and skill resources are useful only behind host capabilities. Core AI Reading must not gain a general tool loop (`.trellis/tasks/07-23-mono-ai-reading-core/prd.md:L30-L34`). |
| Tool registry, run budget, cancellation token, proposal apply service | Core plugin host SDK | New host contract | The host must enforce owner, capabilities, scope, cancellation, and lifecycle; plugin code cannot provide its own trust boundary (`.trellis/tasks/07-23-mono-plugin-host-sdk/design.md:L67-L78`). |
| Conversation/run/proposal data | `library-ask` sidecar | Adapt typed parts | NeuInk's message-part model is a good logical schema (`apps/desktop/src/shared/ipc/assistantApi.ts:L93-L159`), but Mono should persist it in typed sidecar tables/JSON rather than raw `serde_json::Value`. |
| Local PDFJS extraction and accepted document versions | Core documents | Keep core | Disabling `document-services` must leave PDF reading and Markdown functional (`.trellis/tasks/07-23-mono-plugin-integrations/prd.md:L14-L23`). |
| MinerU/custom parser adapters, conversion, raw artifacts | `document-services` plugin | Adapt provider boundary | Providers may submit/poll/fetch, but only core can validate and activate a canonical document candidate (`.trellis/tasks/07-23-mono-plugin-integrations/design.md:L26-L44`). |
| Persisted job ledger, owner cancellation registry, job events | Core plugin host | Strengthen current LitFolio | Jobs coordinate core and plugin shutdown. Plugin-specific checkpoints may be in the sidecar, but status truth and cancellation handles must be host-owned. |

## 2. AI and explicit context

### NeuInk findings

NeuInk represents assistant context as explicit IDs plus a backend-hydrated snapshot. The request carries an active entry, active note, pinned segments, and separate document/note character budgets; the response carries typed entry/note/document/segment snapshots, truncation flags, and warnings (`crates/neuink-ipc/src/commands/assistant.rs:L136-L196`). The harness then states that hydrated note content is workspace data rather than instructions and records whether document content was truncated (`apps/desktop/src/modules/assistant/harness/context.ts:L150-L202`). This is a strong pattern for prompt-injection resistance and observability.

NeuInk also persists context snapshots as message parts alongside plan, task state, run state, memory, tool calls/results, sources, proposals, and errors (`apps/desktop/src/shared/ipc/assistantApi.ts:L93-L145`). Its conversation memory uses a bounded summary when available and otherwise only the last eight non-empty messages with per-message truncation (`apps/desktop/src/modules/assistant/harness/conversationMemory.ts:L3-L42`).

The dangerous counter-pattern is implicit scope growth. With no active entry or selected tag, NeuInk scopes to all parsed entries (`apps/desktop/src/modules/assistant/components/assistantScope.ts:L47-L55`). It then unions historic conversation scope and current scope (`apps/desktop/src/modules/assistant/components/assistantScope.ts:L120-L145`). This is unsuitable for core AI Reading and can silently preserve papers the user no longer intends to disclose.

### Contract to adopt for core AI Reading

```ts
type ReadingContextRef =
  | { kind: "paper"; paperId: string }
  | { kind: "selection"; paperId: string; text: string; page?: number }
  | { kind: "highlight"; paperId: string; highlightId: string };

type ReadingContextRequest = {
  paperId: string;
  refs: ReadingContextRef[];
  documentCharBudget: number;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
};

type ReadingContextSnapshot = {
  snapshotId: string;
  paperId: string;
  paperRevision: number;
  document: null | {
    sourceHash: string;
    markdown: string;
    charCount: number;
    truncated: boolean;
  };
  selections: Array<{ text: string; page?: number; truncated: boolean }>;
  warnings: ContextWarning[];
  createdAt: string;
};
```

Rules:

- The backend resolves all IDs, checks that every ref belongs to `paperId`, applies budgets, and returns a frozen snapshot before making the provider request.
- No empty-scope fallback exists. Missing paper context returns metadata/abstract fallback exactly as planned, never unrelated papers (`.trellis/tasks/07-23-mono-ai-reading-core/design.md:L70-L80`).
- The prompt labels document, selection, note, and tool text as untrusted source data.
- The result records `snapshotId`, source hash, `usedSelection`, and truncation. It never stores API keys or raw profile secrets.
- Core AI Reading does not persist Ask-style sessions and exposes no tool or skill registry.

### Contract to adopt for `library-ask`

```ts
type AskContextRef =
  | { kind: "paper"; paperId: string }
  | { kind: "tag"; tagId: string }
  | { kind: "search-result"; documentId: string; sourceHash: string };

type AskTurnInput = {
  sessionId?: string;
  question: string;
  contextRefs: AskContextRef[];
  retrieval: {
    requestedMode: "keyword" | "semantic" | "hybrid";
    fallbackPolicy: "allow-keyword" | "require-requested";
    limit: number;
  };
};

type AskContextSnapshot = {
  id: string;
  authorizedPaperIds: string[];
  refs: AskContextRef[];
  sources: Array<{
    paperId: string;
    documentId: string;
    sourceHash: string;
    revision: number;
    excerpt: string;
    truncated: boolean;
  }>;
  warnings: ContextWarning[];
  createdAt: string;
};
```

The papers/documents capability resolves `AskContextRef` values and returns bounded DTOs. The plugin never receives a pool, library root, or arbitrary path. Each user turn stores the exact snapshot or immutable references plus source hashes, so replay is explainable and stale sources are detectable.

## 3. Proposal-based writes

### NeuInk findings

NeuInk explicitly says the model cannot write the workspace, while note, entry metadata, and tag changes become reviewable proposals (`apps/desktop/src/modules/assistant/README.md:L10-L28`). Its strongest implementation is note application:

- Frontend verification computes a base-content hash, canonical proposal digest, and idempotency key (`apps/desktop/src/modules/assistant/runtime/verifiedProposal.ts:L5-L40`).
- Apply loads a persisted proposal by task/proposal ID, validates it, replays an existing receipt, recovers an unfinished journal, and only then mutates (`crates/neuink-ipc/src/commands/assistant/note_apply.rs:L30-L50`).
- Existing-note application returns a typed conflict when the current content no longer matches the proposal base (`crates/neuink-ipc/src/commands/assistant/note_apply.rs:L102-L146`).
- Validation checks identity, pending/verified state, base hash, and digest (`crates/neuink-ipc/src/commands/assistant/note_apply.rs:L260-L282`).
- Recovery restores prior Markdown/source links or segment text after an interrupted apply (`crates/neuink-ipc/src/commands/assistant/note_apply.rs:L285-L329`).

The exception is `create_entry`, which the model can execute as an immediate side effect and only deduplicates within one in-memory run (`apps/desktop/src/modules/assistant/sdk/tools.ts:L300-L329`). Mono should not copy this exception.

### Host-owned proposal contract

```ts
type ProposalStatus =
  | "pending"
  | "applying"
  | "applied"
  | "rejected"
  | "conflict"
  | "expired";

type MutationProposal<TTarget, TOperation> = {
  id: string;
  ownerPluginId: string;
  runId: string;
  target: TTarget;
  operation: TOperation;
  base: { revision: number; contentHash: string };
  evidence: SourceRef[];
  digest: string;
  idempotencyKey: string;
  status: ProposalStatus;
  createdAt: string;
  expiresAt?: string;
};

type ApplyProposalResult =
  | { kind: "applied"; receiptId: string; newRevision: number }
  | { kind: "replayed"; receiptId: string; newRevision: number }
  | { kind: "conflict"; currentRevision: number; currentContentHash: string }
  | { kind: "rejected"; code: "proposal_invalid" | "permission_denied" | "plugin_disabled" };
```

Rules:

- Plugins may call `ctx.proposals.create(...)`; only a core capability can apply.
- Apply re-resolves plugin enablement and permission, validates the persisted digest and target ownership, compares base revision/hash, journals the old state, commits atomically, writes a receipt, and emits a typed event.
- Repeating an idempotency key returns the prior receipt.
- Reject/expire never mutates. Conflict never auto-rebases AI text; regeneration must use a fresh snapshot.
- AI-generated edits to notes, annotations, tags, metadata, document versions, and saved Ask artifacts use proposals. Pure generated outputs in dedicated core fields, such as TL;DR or translation, may be persisted directly because the user explicitly invoked that typed operation and it does not overwrite user-authored content.

## 4. Tools and skills

### NeuInk findings

NeuInk exposes JSON-schema tool descriptors for segment search/read (`crates/neuink-ipc/src/commands/assistant.rs:L198-L243`) and only registers supported, enabled tools in the model runtime (`apps/desktop/src/modules/assistant/sdk/tools.ts:L344-L403`). Search tool results carry effective mode and warnings back to the model (`apps/desktop/src/modules/assistant/sdk/toolSupport.ts:L371-L389`). Its loop guard caps turns and tool calls, rejects repeated identical calls/failures, and stops repeated no-progress observations (`apps/desktop/src/modules/assistant/agent-core/cycleGuard.ts:L3-L67`; defaults at `apps/desktop/src/modules/assistant/agent-core/state.ts:L5-L18`). These are good runtime controls.

Skills are instruction/resource packages with scripts explicitly marked disabled (`crates/neuink-ipc/src/commands/assistant/skill_package.rs:L103-L123`). The model can search metadata and load instructions, while the returned policy says scripts are not executable without a separately approved tool/MCP surface (`apps/desktop/src/modules/assistant/sdk/toolSupport.ts:L642-L710`). This separation is worth preserving.

The archive importer is not a suitable plugin contract. It accepts raw workspace/archive paths, performs only non-empty `SKILL.md` validation, and extracts all enclosed files without package size/count/schema/signature limits (`crates/neuink-ipc/src/commands/assistant/skill_package.rs:L76-L124`, `L175-L210`).

### Exact host contract

```ts
type ToolEffect = "read" | "propose" | "write";

type ToolDescriptor<I, O> = {
  id: string;
  ownerPluginId: string;
  version: string;
  description: string;
  inputSchema: JsonSchema<I>;
  outputSchema: JsonSchema<O>;
  effect: ToolEffect;
  requiredCapabilities: PluginCapabilityRequest[];
  timeoutMs: number;
};

type ToolCallContext = {
  runId: string;
  ownerPluginId: string;
  contextSnapshotId: string;
  signal: AbortSignal;
  budget: { remainingCalls: number; remainingChars: number };
  idempotencyKey: string;
};

type ToolResult<O> = {
  output: O;
  sources: SourceRef[];
  warnings: StructuredWarning[];
  degradation?: Degradation;
};
```

Host rules:

- `root`, database handles, secrets, plugin identity, and authorization scope are injected by the host and never appear in model-controlled tool input.
- `effect: "write"` is unavailable to `library-ask`; mutating tools return a proposal. Direct host writes require a separate, explicit user command outside the model loop.
- Input and output are validated on both sides. Tool IDs are owner-namespaced and immutable within a version.
- Time, turn, call, output-size, repeated-call, repeated-failure, and no-progress budgets are enforced by the host.
- Tool calls receive the same cancellation signal as their job. A canceled tool cannot publish a successful result afterward.

```ts
type SkillManifest = {
  id: string;
  ownerPluginId: string;
  version: string;
  formatVersion: number;
  title: string;
  description: string;
  triggers: string[];
  suggestedToolIds: string[];
  contentDigest: string;
  resources: Array<{ path: string; kind: "reference" | "asset" }>;
};
```

Skills remain optional `library-ask` data, not a core feature. Phase one should support declarative instructions/references only. Script execution requires a future separately permissioned tool-package design; importing a skill must never implicitly grant tools or executable code.

## 5. Conversation and run persistence

### NeuInk findings

NeuInk stores a conversation scope snapshot, ordered messages, source links, tool events, proposals, and generic parts in one atomic JSON file (`crates/neuink-ipc/src/commands/conversation.rs:L11-L81`). It seeds user and empty assistant messages before a run, then persists streaming drafts at most once per second (`apps/desktop/src/modules/assistant/components/assistantRunController.ts:L271-L367`). Final messages include sources, task state, run state, memory, and proposals, and the completed agent run is stored separately (`apps/desktop/src/modules/assistant/components/assistantRunController.ts:L531-L596`). This gives useful crash-visible partial output.

Do not copy the persistence implementation. Backend `parts`, tool events, and proposals are raw JSON values (`crates/neuink-ipc/src/commands/conversation.rs:L51-L64`). Message update rewrites the whole conversation with no revision check and does not refresh the conversation index after updating `updated_at` (`crates/neuink-ipc/src/commands/conversation.rs:L263-L296`). Concurrent windows/runs can overwrite each other, and index order can become stale.

### Sidecar contract

`library-ask` should persist:

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
```

- `conversations`: ID, title, opaque optional project ID, revision, timestamps.
- `messages`: ID, conversation ID, ordinal, role, status (`draft|complete|cancelled|failed`), revision, timestamps.
- `message_parts`: message ID, ordinal, type, schema version, validated payload.
- `runs`: run ID, owner, job ID, context snapshot ID, model reference, budgets, status, stop reason, timestamps.
- `proposals`: immutable proposal payload plus mutable review status and receipt reference.

Append and update operations use expected revisions. A streaming draft can be updated, but a complete/cancelled/failed message is immutable. Startup marks orphaned running runs `interrupted`; it does not silently continue network/tool work. Conversation storage does not call an LLM.

The current LitFolio `ask_sessions` table stores a whole `conversation_json` and has a direct foreign key to research projects (`src-tauri/migrations/0034_ask_sessions.sql:L1-L14`). The plugin migration should split typed turns/parts and preserve `project_id` as an opaque nullable string, matching the planned no-cross-sidecar-FK rule (`.trellis/tasks/07-23-mono-plugin-library-ask/design.md:L41-L44`).

## 6. Keyword, semantic, and hybrid search

### NeuInk findings

NeuInk has a clean query-level enum for `keyword`, `semantic`, and `hybrid`, plus paper scope, included source kinds, and a bounded limit (`crates/neuink-search/src/query.rs:L4-L76`). Its search result retains source kind, target, snippet, score, matched terms, index generation, and warnings (`crates/neuink-search/src/result.rs:L123-L153`). Hybrid search merges keyword and semantic ranks with reciprocal-rank fusion (`crates/neuink-search/src/persistent_semantic_index.rs:L284-L328`).

If semantic search fails, NeuInk executes keyword search and marks the mode `semantic_fallback_keyword` or `hybrid_fallback_keyword` with a warning (`crates/neuink-ipc/src/commands/search.rs:L292-L309`, `L755-L773`). This is the right user outcome but the stringly typed mode should be replaced.

NeuInk's semantic cache reuses vectors for stable document keys and invalidates a snapshot on format/fingerprint mismatch (`crates/neuink-search/src/persistent_semantic_index.rs:L43-L61`, `L173-L217`). However, the persisted snapshot records only format version, corpus fingerprint, document ID, and vector (`crates/neuink-search/src/persistent_semantic_index.rs:L256-L267`). It does not identify embedding provider/model revision, dimensions, chunker version, or source document revision. Mono must add those fields.

Current LitFolio Ask already has a useful no-model path: it returns local sources and a local-search answer instead of failing (`src-tauri/src/ai/library_qa.rs:L74-L110`). Its current retrieval is weighted multi-route FTS/fuzzy retrieval rather than vector semantic search (`src-tauri/src/commands/ask.rs:L1-L16`; `src-tauri/src/commands/ask/library.rs:L67-L114`). The existing `paper_embeddings` repository is storage only and is not the current Ask ranking pipeline (`src-tauri/src/storage/embeddings.rs:L18-L82`).

### Search contracts

Core capability:

```ts
interface CoreDocumentSearch {
  keyword(query: {
    text: string;
    authorizedPaperIds?: string[];
    include: Array<"metadata" | "document" | "annotation">;
    limit: number;
  }): Promise<SearchHitPage>;

  readDocuments(input: {
    paperIds: string[];
    maxCharsPerDocument: number;
  }): Promise<CoreDocumentDto[]>;
}
```

Plugin retrieval result:

```ts
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
  warnings: StructuredWarning[];
};

type AskRetrievalResult = {
  execution: SearchExecution;
  hits: AskSearchHit[];
  pendingDocumentCount: number;
};
```

Embedding record:

```ts
type EmbeddingRecord = {
  chunkId: string;
  paperId: string;
  documentId: string;
  sourceHash: string;
  sourceRevision: number;
  chunkerId: string;
  chunkerVersion: string;
  embeddingProviderId: string;
  embeddingModelId: string;
  embeddingModelRevision: string;
  dimensions: number;
  vector: Float32Array;
  createdAt: string;
};
```

Fallback rules:

1. Core Library search always has keyword mode and never depends on `library-ask`.
2. Ask defaults to `hybrid + allow-keyword`. Embedding unavailable, empty, stale, partial, or failed returns keyword results with `effectiveMode: "keyword"` and a structured degradation reason.
3. A user/diagnostic request with `require-requested` returns a structured semantic/index error instead of silently falling back.
4. Missing AI profile still returns retrieval sources with answer mode `local-search`; it does not synthesize an LLM answer.
5. Stale embedding records are excluded, counted as pending, and never presented as current. Source hash/model/chunker changes create an indexing job.
6. Vector build is explicit user work or a separately declared enabled schedule. It never starts as a core startup side effect.

## 7. Parser integration

### NeuInk findings

NeuInk normalizes multiple response shapes (`NeuinkDocument`, `content_list_v2`, `content_list`, embedded JSON) into one document, enriches it from MinerU middle JSON, and assigns segment IDs from type, page, geometry, text, role, and duplicate ordinal (`crates/neuink-parser/src/normalizer.rs:L9-L58`). The canonical document is schema-versioned (`crates/neuink-domain/src/parser.rs:L5-L17`). This adapter/canonical split is strong.

Its custom provider also separates submit, status, and result APIs and understands queued/parsing/succeeded/failed/cancelled/unknown states (`crates/neuink-parser/src/custom_endpoint.rs:L17-L44`, `L103-L163`). The cloud adapter returns both normalized document and raw ZIP provenance (`crates/neuink-parser/src/cloud_mineru.rs:L32-L43`, `L166-L203`).

The integration lifecycle is weak. IPC marks `Uploading` and then `Uploaded` before it calls the provider (`crates/neuink-ipc/src/commands/entry.rs:L881-L906`). Polling sleeps for up to 900 attempts without a cancellation token (`crates/neuink-parser/src/custom_endpoint.rs:L430-L457`). There is no provider cancel method, and retry accepts failed tasks but not cancelled tasks (`crates/neuink-ipc/src/commands/entry.rs:L845-L879`).

Stable segment IDs are useful for a single normalized source revision, but IDs derived from parser text/geometry will change when parser output changes. They must not become the identity of core annotations or user notes without an explicit reanchoring/alias process.

### Document service contract

```ts
interface DocumentParserService {
  id: string;
  version: string;
  capabilities(): ParserCapabilityState;
  submit(input: ParseRequest, ctx: JobExecutionContext): Promise<RemoteParseRef>;
  poll(ref: RemoteParseRef, ctx: JobExecutionContext): Promise<RemoteParseState>;
  fetch(ref: RemoteParseRef, ctx: JobExecutionContext): Promise<ParsedDocumentCandidate>;
  cancel?(ref: RemoteParseRef): Promise<"cancelled" | "unsupported" | "already-terminal">;
}

type ParseRequest = {
  paperId: string;
  sourceFile: GrantedFileHandle;
  sourceHash: string;
  options: { ocr?: boolean; formula?: boolean; table?: boolean; pages?: string };
};

type ParsedDocumentCandidate = {
  schemaVersion: number;
  parser: { serviceId: string; version: string; remoteTaskId?: string };
  sourceHash: string;
  segments: Array<{
    id: string;
    ordinal: number;
    kind: string;
    text: string;
    pageIndex: number;
    bbox?: [number, number, number, number];
    role?: string;
  }>;
  warnings: StructuredWarning[];
  artifactHandles: GrantedFileHandle[];
};
```

Core activation rules:

- The plugin stages output under its job, normalizes it, and submits a `document-version` proposal. It never writes core Markdown/FTS directly.
- Core validates schema, size, non-empty content, finite/in-range geometry, page bounds, source hash, and parser provenance before atomically activating a new core-owned document version and rebuilding core FTS.
- Failed, invalid, or cancelled parsing deletes staged output and leaves the prior core PDFJS/Markdown version active.
- Replacing an active document triggers source-hash invalidation events for `library-ask`; the plugin marks affected embeddings pending.
- Parser absence returns `service_unavailable`; core PDFJS extraction, Reader, keyword search, and existing document versions continue normally.
- If remote cancellation is unsupported, local cancellation stops upload/poll/fetch and records `remoteMayContinue: true`; no late remote result may be applied without a new explicit resume/import action.

## 8. Job lifecycle and cancellation

### NeuInk and current LitFolio findings

NeuInk's job DTO has useful kind, scope, progress, message/error, timestamps, and events (`crates/neuink-job/src/lib.rs:L11-L113`). Its manager emits queued/started/progress/terminal events, but all jobs/events are memory-only and bounded (`crates/neuink-job/src/lib.rs:L115-L234`, `L254-L284`). `cancel` only changes status; it has no execution handle or cancellation signal (`crates/neuink-job/src/lib.rs:L176-L187`).

NeuInk assistant runs use an `AbortController`, persist partial assistant drafts, and mark running nodes cancelled on abort (`apps/desktop/src/modules/assistant/components/assistantRunController.ts:L214-L239`, `L418-L524`; `apps/desktop/src/modules/assistant/harness/runState.ts:L71-L111`). This is useful UX, but the controller and abort handle live in frontend memory and cannot implement plugin disable or process-restart semantics.

LitFolio is already better because jobs are persisted (`src-tauri/migrations/0033_jobs.sql:L1-L24`). However, current `JobRepo::cancel` also only transitions the database row to `cancelled` (`src-tauri/src/storage/jobs.rs:L148-L155`). The generic `job_cancel` command does not signal worker execution (`src-tauri/src/commands/jobs.rs:L78-L83`). Mono must fix this before plugins rely on the jobs capability.

### Exact job contract

```rust
enum JobStatus {
    Queued,
    Running,
    CancelRequested,
    Succeeded,
    Failed,
    Cancelled,
    Interrupted,
}

struct JobRecord {
    id: JobId,
    owner: JobOwner, // Core or Plugin(plugin_id)
    kind: String,
    scope: JobScope,
    status: JobStatus,
    phase: String,
    cancellable: bool,
    progress_current: u64,
    progress_total: Option<u64>,
    checkpoint: Option<serde_json::Value>,
    attempt: u32,
    max_attempts: u32,
    error: Option<StructuredError>,
    created_at: DateTime<Utc>,
    started_at: Option<DateTime<Utc>>,
    updated_at: DateTime<Utc>,
    finished_at: Option<DateTime<Utc>>,
}

struct JobExecutionContext {
    job_id: JobId,
    owner: JobOwner,
    cancellation: CancellationToken,
    checkpoint: JobCheckpointWriter,
    progress: JobProgressWriter,
}
```

Transitions:

```text
queued -> running -> succeeded | failed | cancel_requested
queued -> cancelled
running -> interrupted                 (process shutdown/crash recovery)
cancel_requested -> cancelled | failed (cleanup failure)
failed | cancelled | interrupted -> queued (explicit retry/resume policy)
```

Cancellation semantics:

1. `cancel(jobId)` verifies owner/permission and atomically changes an active job to `cancel_requested`; queued jobs can become `cancelled` immediately.
2. The host then cancels the registered token. Worker/provider loops check it before and after every awaited network call, between batches, and before publishing progress or committing output.
3. A running job becomes `cancelled` only after the worker acknowledges cancellation and staged cleanup/checkpointing succeeds. A status change alone is not cancellation.
4. Canonical writes use stage-validate-commit. Cancellation before commit leaves old state. Once an atomic commit succeeds, cancellation cannot relabel the committed operation as if it never happened.
5. Plugin disable first rejects new jobs, requests cancellation for every owned active job, waits a bounded interval, records non-cooperative jobs as failed/interrupted with a structured reason, then removes contributions and closes handles. This implements the planned host order (`.trellis/tasks/07-23-mono-plugin-host-sdk/design.md:L80-L99`).
6. Startup changes orphaned `running`/`cancel_requested` rows to `interrupted`. Resume requires a compatible checkpoint, unchanged source hash, enabled owner, and explicit job policy; network jobs do not silently resume.
7. Events are derived from persisted transitions and carry monotonic sequence numbers. UI subscriptions may miss events and recover by listing jobs after the last sequence.

Core AI Reading requests should use the same cancellation registry even when too short-lived for the global jobs UI. `ai_cancelled` is returned only after provider work has been aborted or detached and no result can be committed.

## 9. Graceful degradation matrix

| Condition | Required behavior |
| --- | --- |
| No AI profile | Core Reader/library stay functional. AI Reading returns `ai_profile_missing`. `library-ask` may return keyword sources with `answerMode: local-search`; no fake synthesized answer. |
| Invalid/unavailable AI profile | Structured `ai_profile_invalid`/`ai_request_failed`; no startup probe; secrets remain backend-only. |
| `library-ask` disabled/excluded | No Ask route, sessions, semantic status, vectors, tools, or skills. Core keyword search and current-paper AI continue. |
| Embedding model unavailable | Hybrid/semantic with allowed fallback returns typed keyword degradation. Index state is `unavailable`, not `ready` or `empty`. |
| Embedding index empty | Return keyword or empty result per fallback policy and offer explicit index action. Do not build on startup. |
| Embedding index partial/stale | Exclude stale chunks, report pending count, search current chunks plus keyword fallback, and keep source/version warnings. |
| LLM unavailable after retrieval | Persist the user turn and retrieved sources; mark assistant turn failed/cancelled. Retry may reuse only source hashes that are still current. |
| Document missing | Core current-paper AI uses bounded metadata/abstract fallback. Ask keyword metadata search remains available. |
| `document-services` disabled | Existing core PDFJS/Markdown/FTS remains active. No MinerU/config/status UI or jobs. |
| Parser provider failure/invalid output | Fail parser job, remove staging, retain prior canonical document, return structured provider/validation error. |
| Cancel while parsing/indexing/answering | Request cancellation, stop provider/poll/batch work, clean or checkpoint staging, then mark cancelled. Late results cannot commit. |
| Plugin disabled mid-job | Reject new calls immediately; host performs owner-wide cancellation and bounded wait before disposing storage/contributions. |
| App restart mid-job | Persisted active jobs become interrupted. No automatic network resume; compatible local indexing may expose explicit resume. |
| Proposal base changed | Return conflict with current revision/hash. Preserve proposal for review; never silently overwrite or auto-rebase. |

## 10. Anti-patterns to prohibit

1. **Implicit full-library context.** NeuInk's empty scope becomes every parsed entry (`apps/desktop/src/modules/assistant/components/assistantScope.ts:L47-L55`). Core AI Reading must fail closed to the requested paper; `library-ask` must obtain full-library scope through an explicit plugin action/capability.
2. **Startup semantic work.** NeuInk starts vector cache warmup during search worker startup (`crates/neuink-ipc/src/commands/search.rs:L155-L168`). Mono indexing is explicit or a separately declared plugin schedule.
3. **Frontend secrets.** NeuInk includes API keys in frontend settings/profile types (`apps/desktop/src/shared/ipc/assistantApi.ts:L18-L47`). Mono returns profile references and capability state only.
4. **Status-only cancellation.** Both NeuInk and current LitFolio can label work cancelled without stopping it (`crates/neuink-job/src/lib.rs:L176-L187`; `src-tauri/src/storage/jobs.rs:L148-L155`). Terminal cancellation requires worker acknowledgement.
5. **False lifecycle transitions.** NeuInk marks upload completed before provider submission (`crates/neuink-ipc/src/commands/entry.rs:L881-L906`). State follows real side effects and persisted checkpoints.
6. **Direct model mutations.** NeuInk allows model-driven entry creation (`apps/desktop/src/modules/assistant/sdk/tools.ts:L300-L329`). Mono model tools read or propose; user commands apply.
7. **Raw roots/paths in model or plugin inputs.** NeuInk tool schemas include `root` (`crates/neuink-ipc/src/commands/assistant.rs:L198-L243`) and skill import accepts raw paths. Mono host injects scoped capabilities/handles.
8. **Stringly typed effective mode.** NeuInk encodes fallback in strings such as `hybrid_fallback_keyword` (`crates/neuink-ipc/src/commands/search.rs:L755-L773`). Mono stores requested mode, effective mode, degradation flag, and reason separately.
9. **Unproven embedding reuse.** Do not reuse vectors based only on corpus fingerprint/document key. Require exact source hash, model revision, dimensions, and chunker provenance.
10. **Untyped conversation payloads and whole-file rewrites.** NeuInk backend stores parts/proposals as arbitrary JSON and lacks update revisions (`crates/neuink-ipc/src/commands/conversation.rs:L51-L64`, `L263-L296`). Mono validates versioned parts and uses optimistic concurrency.
11. **Plugin writes to core document/search stores.** Parser and Ask plugins submit candidates or consume capabilities; they never open `library.db`, mutate core FTS, or scan the library root.
12. **Parser-derived IDs as user-data identity.** Content/geometry-derived segment IDs can change across parser versions. User annotations remain anchored in core PDF/page geometry/text with explicit reanchoring.
13. **Skills as permission grants.** Skill instructions can suggest tool IDs but cannot enable them. Scripts are inert resources unless a future signed, sandboxed, separately granted tool package exists.
14. **Silent fallback presented as requested behavior.** Keyword fallback is a valid result only when the response and UI disclose the effective mode and reason.

## 11. Recommended acceptance tests

### Core and AI Reading

- Current-paper context snapshot rejects unrelated paper refs and proves no embedding/session/vector access.
- Selection/document budgets, truncation, source hash, warnings, missing-document fallback, and prompt data labeling are deterministic.
- Profile missing/invalid, cancellation, provider failure, and success never affect Reader/local search.

### `library-ask`

- Keyword, semantic, hybrid RRF, every degradation reason, strict no-fallback mode, stale-vector exclusion, and source authorization.
- No-profile local-search response; partial assistant draft persistence; cancel/restart/retry; typed context/source/tool/proposal parts.
- Plugin disable during answer/index cancels real execution, rejects late commits, closes vector/sidecar handles, and retains sessions.

### `document-services`

- Provider submit/poll/fetch/cancel, timeout, unsupported remote cancellation, malformed JSON/ZIP, empty output, invalid geometry, and source-hash mismatch.
- Candidate proposal conflict, staged cleanup, atomic activation, old-version retention, FTS rebuild, and embedding invalidation event.
- Disabled/excluded plugin leaves core PDFJS, existing Markdown, Reader, and keyword search fully usable.

### Host jobs/proposals/tools

- Cancel queued/running/between-batches/before-commit/after-commit; process restart; non-cooperative provider; disable timeout; event replay.
- Proposal digest tamper, stale base, duplicate apply, interrupted journal recovery, permission revoked, plugin disabled, and receipt replay.
- Tool input/output schema rejection, forged owner/scope, secret/path leakage, timeout, repeated-call guard, no-progress guard, and cancellation race.

## Final recommendation

Use NeuInk as a source of contract ideas, not a dependency. The highest-value transfer is the combination of frozen explicit context, typed turn artifacts, reviewable proposals, and disclosed search degradation. Implement those through Mono's host-owned capability, proposal, and job boundaries. Keep core AI Reading deliberately non-agentic; place conversation persistence, retrieval tools, skills, embeddings, and hybrid ranking entirely in `library-ask`; place parser providers and raw artifacts entirely in `document-services`; require both plugins to degrade to core local documents and keyword search without startup work or data loss.
