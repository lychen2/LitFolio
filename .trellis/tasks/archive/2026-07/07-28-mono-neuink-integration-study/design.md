# NeuInk-Informed Mono Integration Design

## 1. Design Position

NeuInk is a reference implementation, not a LitFolio dependency or plugin runtime. LitFolio adopts behavior-level contracts through clean, project-native implementations unless a future change explicitly chooses the Apache-2.0 reuse track and records provenance.

The selected delivery split is:

```text
V1: authority + provenance + data safety
  -> V1.1: synchronized reading + workspace/editor experience
```

V1 must make the eventual UI safe and durable. V1.1 must consume V1 contracts rather than inventing a parallel source, note, or workspace model.

## 2. Adopt, Adapt, Reject

| Decision | NeuInk concept | LitFolio treatment |
| --- | --- | --- |
| Adopt | Explicit source segments, source snapshots, backlinks | Core-owned accepted document revisions, stable segment anchors, immutable snapshot fallback, indexed reverse lookup |
| Adopt | Explicit AI context and visible tool traces | Host-owned frozen context envelopes and redacted execution records |
| Adopt | Proposal-before-mutation behavior | Host/core proposal service with base revision/hash, digest, idempotency receipt, conflict result, and recovery journal |
| Adapt | Reflow over parser segments | V1 core segment contract; V1.1 generic Reader content mode. Parser/provider internals stay in `document-services` |
| Adapt | Search provider separation and graceful fallback | Keyword search stays core; vectors, embeddings, semantic/hybrid ranking, and model dependencies stay in `library-ask` |
| Adapt | Typed jobs and event stream | Extend LitFolio's persisted jobs with owners, real cancellation tokens, interruption recovery, event sequence numbers, and disable drain |
| Reject | Global IPC registry and process-wide subsystem singletons | Feature-gated command slices, managed host state, opaque plugin instance bindings, and operation-level authorization |
| Reject | Raw workspace paths, direct secrets, global HTTPS, startup workers | Opaque handles, host-owned request adapters, typed grants, no startup network, explicit or scheduled user triggers |
| Reject | String errors, dynamic annotation kinds, last-writer-wins files | Structured errors, existing typed annotation union, optimistic revisions, atomic/staged persistence |
| Reject | MCP/process tools in V1 | No process, shell, local daemon, TCP plugin RPC, or generic command capability |

## 3. V1 Domain Contracts

### 3.1 Accepted Documents

Core owns accepted, parser-neutral document state:

```ts
type DocumentRevision = {
  id: string;
  paperId: string;
  sourceHash: string;
  schemaVersion: number;
  ordinal: number;
  status: "active" | "superseded";
  createdAt: number;
};

type DocumentSegment = {
  id: string;
  revisionId: string;
  ordinal: number;
  page: number;
  bbox: PdfRect | null;
  kind: "heading" | "paragraph" | "list" | "table" | "formula" | "figure" | "caption" | "other";
  text: string;
  markdown: string | null;
  assetRef: string | null;
  continuationGroupId: string | null;
  visualGroupId: string | null;
};

type SegmentAnchor = {
  paperId: string;
  revisionId: string;
  segmentId: string;
  quoteHash: string;
};
```

A parser plugin owns submission, polling, raw responses, provider metadata, retries, and staging. It submits a candidate through a typed capability. Core validates source hash, schema, sizes, pages, geometry, assets, and ordering before an atomic activation updates canonical Markdown/segments and core FTS. Failed or cancelled candidates cannot replace the current revision.

### 3.2 Source Links and Backlinks

Core source links bind a stable note anchor to one or more segment references. Every reference stores a creation-time snapshot with page, PDF-space geometry, semantic kind, text or asset handle, and quote hash.

Resolution returns one of `current`, `moved`, `changed`, or `missing`. Live data is preferred; snapshot fallback is always available. Backlinks are indexed in core storage and queried by segment or note. No frontend library-wide scan is accepted.

Reparse creates a new revision, performs deterministic remap, preserves old snapshots, and reports unchanged/moved/changed/unresolved counts. It never silently rewrites all references.

### 3.3 Save and Recovery

Notes, links, and annotations use expected revisions. Frontend controllers serialize per-entity writes and expose one host-compatible surface protocol:

```ts
interface DirtySurface {
  status(): "clean" | "dirty" | "saving" | "error";
  save(): Promise<void>;
  flush(): Promise<void>;
  discard(): Promise<void>;
}
```

App close, paper change, workspace switch, tab close, and plugin disable invoke the same protocol. Failure retains the surface and recoverable draft. Cross-file/database mutations use one SQLite transaction or a durable stage/journal protocol; per-file atomic rename is not treated as multi-resource transactionality.

## 4. AI, Proposal, and Execution Contracts

### 4.1 Explicit Context

Core AI Reading uses a host-constructed `ContextEnvelope` scoped to the current paper or explicit selection/highlight. It includes resource references, source hashes/revisions, budgets, truncation flags, provenance, and warnings. Empty scope never expands to the library.

`library-ask` can request library retrieval through explicit user-visible scope transition. The resulting frozen snapshot records authorized paper IDs and source hashes. Plugins cannot append resources after approval or receive raw database/path authority.

### 4.2 Proposal Writes

AI/tool output that would alter user-authored notes, annotations, tags, metadata, accepted documents, or project artifacts creates a proposal. Core applies it only after permission and enablement are rechecked, base revision/hash matches, digest is valid, and a receipt/journal can guarantee idempotency and recovery.

Direct typed outputs such as a user-requested TL;DR may persist to dedicated generated fields because they do not overwrite user-authored content. Agent/tool loops remain outside core AI Reading.

### 4.3 Visible Execution

Core owns an `ExecutionRecord`/event ledger for AI calls, plugin tools, network calls, schedules, parser jobs, proposal apply, and privileged failures. Records include owner, trigger, context references, operation, target host/resource summary, state, timing, correlation ID, cancellation, degradation, and a redacted result/error.

Plugins emit through host services but cannot suppress, rewrite, or delete required records. Secrets and full private excerpts are excluded by default.

## 5. Plugin Authority and Manifest

One canonical `PluginManifestV1` is the source for runtime validation and build inclusion. It declares ID/version/API version, display name, frontend/backend activation entries, dependencies, capabilities, contributions, storage/data version, migrations, and frontend/Cargo build entries. Generated frontend, Rust, runtime, mock, and build registries must agree.

On activation, the host issues an opaque instance binding containing immutable plugin identity, generation, and grants. The frontend transport attaches it; Rust resolves it before each operation. A caller-supplied plugin ID is descriptive and never authorizes access.

Disable revokes the generation before cleanup, rejects new work, cancels/drains owned jobs, removes contributions/listeners/schedules, invokes the disposer, closes storage, and records failures. Every callback, retry, commit, and result publication compares its generation; late results are discarded.

Typed grants include operation, resource scope, quota/limits, consent policy, and revocation behavior. Network redirects are revalidated; secrets are referenced only by ID and applied inside a host-owned request adapter.

## 6. Ownership Placement

| Capability | Owner |
| --- | --- |
| Paper/PDF metadata, PDF.js text, accepted document revisions/segments, keyword search, notes, links/snapshots/backlinks, annotations, baseline export | Core |
| Current-paper TL;DR, Quick Read, translation, terminology, explanation, explicit current-paper questions | Core AI Reading |
| Manifest compiler, plugin binding/reference monitor, job runtime, proposals, execution records, typed grants | Core host/SDK |
| Remote metadata/DOI/arXiv/PDF acquisition | `source-connectors` |
| Candidate inbox and manual review | local first-party plugin, separated from network discovery |
| RSS/topic discovery, remote refresh, explicit schedules | `discovery-feeds` |
| Full-library retrieval, Ask sessions, vectors, embeddings, semantic/hybrid search, declarative skills | `library-ask` |
| Projects/evidence/writing proposals | `research-workbench` |
| Graph/citation/similarity UI and data | `knowledge-graph` |
| Queue/smart collections/custom fields/duplicates | `library-plus` |
| WebDAV and library synchronization | `sync-integrations` |
| Obsidian export and document conversion | `document-services` |
| MinerU/custom parser endpoints/raw parser artifacts | `document-services` |
| Update checks and schedules | removable `updates` integration; no startup check until user action or persisted opt-in schedule |

## 7. V1.1 Boundary

V1.1 may add `reader.contentModes` and `app.workspaceSurfaces` contribution types after V1 persistence and lifecycle gates pass. Core provides PDF, Reflow, note, backlink, and annotation surfaces; plugins register declared factories with owner/version and disposal semantics.

The layout envelope is versioned and validates every paper/note/plugin owner during restore. Unsaved drafts use the V1 journal. Rich note editing is staged after source-link round-trip and export correctness; it does not replace existing Markdown files during V1.

## 8. Migration and Rollback

Historical migrations remain immutable. New migrations add document revisions/segments, source links/refs, reverse indexes, revisions, proposal/execution metadata, and job ownership/cancellation state as required by owning children.

Legacy papers remain valid without segments. Existing note Markdown and note sections are preserved byte-for-byte until an explicit conversion. Existing highlight geometry and `PdfTextNote` migration remain authoritative; source anchors are nullable enrichment.

Every conversion supports preview, full backup, durable stage marker, verification counts, failure injection, automatic restore, and idempotent rerun. Plugin inclusion comes from the canonical resolved manifest plan; omitted plugin data is archived or preserved, never silently dropped.

## 9. Algorithm Efficiency Gates

The following algorithms are adopted as contracts, not copied implementations:

| Algorithm | Complexity target | Owner | Required benchmark gate |
| --- | --- | --- | --- |
| Indexed backlinks by revision/segment | `O(log E + K)` lookup | Core provenance | 1,000,000 refs / 100-result cold-process query p95 `<= 50 ms`, one IPC and one indexed SQL query |
| Single-pass segment normalize + validate | Expected `O(S)` time, `O(U)` fingerprint memory | `document-services` normalization plus core validation | 10,000 segments in `<= 200 ms`, peak memory `<= 2x` canonical payload |
| Exact-first page/kind-bucket remapping | `O(S_old + S_new + S * B)` for bounded bucket size `B` | Core provenance | 10,000 segments in `<= 500 ms`, 100% unchanged recovery and zero false automatic ambiguity matches |
| Atomic file replace + transaction/stage journal | `O(bytes + resources)` with one visibility boundary | Core storage/host | 100 injected failures yield only old/new hashes; recovery rerun causes zero duplicate logical mutation |
| Real cancellation + coalesced progress | `O(1)` signal; persisted writes scale with flush ticks, not raw progress ticks | Core jobs/host | Cancel p99 `<= 250 ms` outside non-interruptible OS calls; no post-cancel commit; 100 jobs at 20 ticks/s persist `<= 500` updates/s |
| Bounded Top-K RRF + revision-aware embedding cache | `O(K)` fusion; re-embed only changed chunks `O(C * E_model)` | `library-ask` | RRF of two `K <= 100` lists `<= 2 ms`; unchanged chunks trigger zero embedding calls; vector backend must independently prove its claimed corpus-scale latency |

The benchmark harness pins dataset shape, warm/cold cache condition, hardware class, implementation version, and baseline. A threshold failure does not justify weakening correctness or moving optional algorithms into core. NeuInk's current semantic index is a design reference only; large-corpus ANN selection remains a separately benchmarked `library-ask` backend decision.

## 10. Compliance Boundary

The clean track is default. Implementers consume these LitFolio requirements and tests, not NeuInk code expression, identifiers, prompts, CSS, assets, or screenshots. Direct reuse is blocked unless full upstream history and contributor/file provenance have been independently reviewed; otherwise clean reimplementation is mandatory. An approved reuse track must pin NeuInk commit/path/destination, retain Apache-2.0 and applicable NOTICE, mark modified files, replace branding, and pass release SBOM/artifact review.

No model weight or external service is covered by NeuInk's project license. MinerU source bundling is a release stop until a version-pinned GPL compatibility review; API integrations require current service/privacy review and explicit data-transfer disclosure.

## 11. Sequencing

1. Repair source-backed specifications, canonical manifest/types, core boundaries, and startup network ownership.
2. Land revision-safe PDF annotation controllers, then the provenance-reading child.
3. Land explicit-context core AI Reading and the minimal host authority/lifecycle vertical slice.
4. Add privileged plugin capabilities and first-party plugins incrementally; parser/Ask plugins consume proven core contracts.
5. Complete legacy conversion, build pruning, V1 integration, then begin V1.1 workspace/Reflow/editor delivery.
