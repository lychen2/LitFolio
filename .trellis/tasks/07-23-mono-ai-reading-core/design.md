# Move AI Reading into Mono Core - Design

## 1. Scope / Trigger

This child owns direct, non-agentic AI assistance for the current paper and its profile/model selection. It removes current Reader dependence on full-library Ask. Context uses accepted provenance records from `mono-provenance-reading`; annotation insertion uses the completed Reader controller contract. Full-library retrieval, conversations, embeddings, tools, and skills remain `library-ask` responsibilities.

## 2. Signatures

### Core Model Selection

```ts
type ActiveReadingModel = {
  profile: string;
  model: string;
};

type AiCapabilityState =
  | { status: "ready"; active: ActiveReadingModel }
  | { status: "not-configured" }
  | { status: "invalid"; message: string };
```

The active profile's chat model is the default reading model. A single explicit reading-model override may be supported if it remains one value, not per-action assignments.

### Frozen Current-Paper Context

```ts
type ReadingContextRef =
  | { kind: "paper"; paperId: string }
  | { kind: "selection"; paperId: string; text: string; page?: number }
  | { kind: "highlight"; paperId: string; highlightId: string };

type ReadingContextRequest = {
  paperId: string;
  refs: ReadingContextRef[];
  documentCharBudget: number;
  historyCharBudget: number;
};

type ReadingContextEnvelope = {
  id: string;
  scope: { kind: "current-paper"; paperId: string };
  refs: ReadingContextRef[];
  paperRevision: number;
  document: null | {
    revisionId: string;
    sourceHash: string;
    markdown: string;
    truncated: boolean;
  };
  budgets: { documentChars: number; historyChars: number };
  provenance: SourceRef[];
  warnings: StructuredWarning[];
  createdAt: string;
};

type ReaderQuestionInput = {
  question: string;
  contextEnvelopeId: string;
};

type ReaderQuestionResult = {
  answer: string;
  model: string;
  executionId: string;
  contextEnvelopeId: string;
  context: { paperId: string; usedSelection: boolean; truncated: boolean };
};
```

The host resolves every reference, verifies paper ownership, applies budgets, labels hydrated text as untrusted source data, and freezes the envelope before provider dispatch. The provider receives the envelope reference, never caller-supplied hydrated content or an authority-bearing paper ID. No API permits appending refs after freeze.

```text
ai_reading_capability_state() -> AiCapabilityState
reader_ask_paper(input) -> ReaderQuestionResult
```

Existing core commands for TL;DR, Quick Read, translations, terms, and highlight actions remain typed but share one resolver and structured error contract.

### Rust Boundary

```rust
trait ReadingModelResolver {
    fn resolve(&self, paths: &LibraryPaths) -> Result<LlmProfile, AiReadingError>;
}
```

The backend loads secrets. Frontend config responses redact `api_key`.

### Cancellation, Execution, and Mutation

Every dispatch creates a host-owned cancellation token and redacted execution record before network I/O. The token is propagated through streaming and non-streaming provider clients. `running` transitions exactly once to `succeeded`, `failed`, or `cancelled`; a late callback checks operation generation/token state and cannot persist or publish after terminality.

Dedicated generated fields such as TL;DR and translations may be written by their explicit typed commands. Output targeting a user-authored note, annotation, tag, metadata record, or accepted document becomes a host proposal containing target, base revision/hash, evidence refs, digest, and idempotency key. Apply rechecks authority and base state; conflicts never auto-rebase.

## 3. Contracts

- Reader question context contains only host-resolved current-paper metadata/body plus approved selection/highlight refs and bounded history defined by core. The persisted envelope records accepted revision/source hashes, budgets, truncation, provenance, and warnings.
- Empty document context falls back only to the requested paper's metadata/abstract. Cross-paper refs, stale refs that cannot resolve safely, and any post-freeze append are rejected before network I/O.
- No `PaperDocumentRepo` retrieval across papers, embedding search, vector directory, Ask session repository, or tool registry is reachable from `reader_ask_paper`.
- Every network command starts from a direct UI action, creates a redacted execution record, and supports real cancellation through provider I/O. Cancellation is not a status-only update.
- Capability-state/config reads are local and do not test/list remote models automatically.
- Core profile loading remains compatible with legacy bare task bindings and stale active names; migration/reporting does not discard plugin-owned assignments.
- Core output language and paper/highlight/term results remain local-first and typed.
- Annotation and note mutations use revision/hash-bound proposals and Reader/annotation apply APIs, not direct component or model storage calls.
- Core exposes fixed typed commands and typed outputs only. It has no tool registry, skill loader, retrieval-mode selector, conversation/run-part store, or autonomous turn loop.

## 4. Validation & Error Matrix

| Condition | Error/result |
| --- | --- |
| no profiles | `ai_profile_missing`; local Reader unaffected |
| active profile missing | deterministic fallback plus local warning/migration state, or `ai_profile_invalid` if no valid profile |
| keyring secret unavailable | structured profile-invalid/recoverable error; never log secret |
| paper missing | `paper_not_found` before network |
| document absent | bounded abstract/metadata fallback with `truncated=false` |
| cross-paper or appended context ref | `ai_context_unauthorized` before network |
| stale accepted revision/ref | `ai_context_stale` with no implicit widening |
| empty question/selection | `ai_invalid_request` |
| request cancelled | provider I/O aborted; execution terminal `cancelled`; late output discarded |
| provider/network failure | `ai_request_failed` with safe message |
| proposal base changed | typed conflict; user content unchanged |
| unrelated paper retrieved | test/security failure |

## 5. Good / Base / Bad Cases

- Good: selected text plus a question is answered from a frozen current-paper envelope, links its redacted execution record, and reports the exact revision/truncation state used.
- Base: no profile shows a configure action while PDF and annotations continue working.
- Bad: `PdfSelectionAskBox` calls `libraryAsk(..., [paperId])`, which still enters full-library RAG/session infrastructure.

## 6. Tests Required

- Profile resolver tests for empty config, active model, stale active name, legacy task bindings, keyring migration/redaction, and plugin-owned passthrough data.
- Backend tests proving current-paper question context cannot include another paper and does not call embeddings/session repositories.
- Envelope tests for ref authorization, source-revision capture, budgets, truncation, stale refs, empty-scope behavior, and post-freeze append rejection.
- Command/parser/mock parity for capability state, envelope/execution IDs, and result metadata.
- UI tests for no-profile, pending, real cancel, retry, provider failure, proposal conflict/review, and success for every core action.
- Execution-ledger tests for redaction, running-to-terminal state, exactly-once terminality, and late-result suppression.
- Provider cancellation tests proving the underlying mock request observes the token rather than merely relabeling state.
- Proposal tests for digest/base validation, conflict, idempotent replay, recovery, and no direct user-content writes.
- Network-spy startup/Reader tests proving zero AI requests before user action.
- Existing summary, translation, term, highlight, and config tests.
- Reader E2E with and without a configured mock profile.

## 7. Wrong vs Correct

Wrong:

```ts
api.libraryAsk(question, 16, undefined, [paperId]);
```

Correct:

```ts
const envelope = await aiReadingApi.freezeContext({ paperId, refs, budgets });
await aiReadingApi.askPaper({ question, contextEnvelopeId: envelope.id });
```

The public Reader controller may accept the current selection, but it first asks the host to construct/freeze `ReadingContextEnvelope`; the provider command receives only the resulting envelope reference.

Wrong config ownership:

```rust
resolve_for_task(TaskKind::TopicSurvey)
```

inside core Reader code.

Correct: core Reader calls one `ReadingModelResolver`; topic survey remains plugin-owned.
