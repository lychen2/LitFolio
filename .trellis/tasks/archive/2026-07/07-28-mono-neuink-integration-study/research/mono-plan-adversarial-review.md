# Adversarial Review: LitFolio Mono Plan vs. NeuInk

## Review Scope

Reviewed on 2025-07-28:

- LitFolio Mono parent plan: `07-23-litfolio-mono/{prd,design,implement}.md` and its existing research.
- All fourteen Mono child PRD/design pairs under `07-23-litfolio-mono/`.
- LitFolio's current updater startup path in `src/main.tsx` and `src/lib/autoUpdate.ts`.
- Fixed NeuInk checkout at `/tmp/litfolio-neuink-audit`, pinned to commit `11b848e0cfe9100a0386bcf2d4f3b839148d3b99`.
- Pi documentation for its minimal-core, extension, tool, package, and lifecycle model.

This review evaluates the plan against this intended philosophy:

1. A small capable Mono core.
2. An explicit, typed extension API.
3. User-driven context.
4. Visible tool execution.
5. Strong failure isolation.
6. No hidden network activity.
7. Removable first-party extensions.

## Verdict

Do not begin the extraction sequence as currently written. The target architecture is directionally sound, but it has four P0 contradictions that would make the claimed boundary unenforceable or false at release time:

1. Core startup already performs an automatic updater network check.
2. Plugin identity and capability enforcement are only described, not represented as an enforceable backend transport contract.
3. The manifest contract is internally inconsistent and lacks sufficient data for a removable build graph.
4. The legacy conversion plan depends on plugin inclusion metadata that is introduced later, creating a sequencing cycle.

NeuInk supplies useful interaction patterns for explicit context, tool traces, bounded execution, and persisted evidence. It is not an appropriate plugin-host architecture to copy. Its app is statically assembled, its desktop HTTP capability is broad, and its agent/MCP implementation has a configuration-level permission mode without an equivalent backend execution gate.

## Severity-Ranked Findings

### F-01 (P0): "No core startup network" contradicts current LitFolio behavior

**Plan claim.** Parent PRD `CORE-006` says core startup does not initiate network activity except schedules registered by an enabled plugin. Parent acceptance criterion 1 repeats that importing/starting the core does not initiate network work.

**Repository evidence.** `src/main.tsx:9,37` imports and invokes `startAutoUpdateCheck()` during application startup. `src/lib/autoUpdate.ts:243-253` checks for an updater immediately, then schedules six-hour repeats. This is a core startup network operation today, not an enabled-plugin schedule.

**Risk.** The project can pass structural extraction tests while violating the principal runtime claim as soon as the shipped app starts. A runtime policy cannot be inferred from module ownership alone.

**Required amendment.** Add a named owner and a hard choice before host extraction:

- Move update checking to a removable `updates` integration plugin, disabled by default; or
- Define updater checks as an explicitly consented core exception in PRD/design and show the action before it occurs.

The first option is consistent with the stated goal. The second weakens that goal and should be rejected unless product requirements require mandatory auto-updates.

**Acceptance tests.**

- Boot an app with no plugins enabled while recording all frontend and Tauri network requests. Assert zero requests.
- Enable only the update plugin. Assert no request occurs before a user-approved check or a persisted, user-enabled schedule.
- Disable the update plugin and restart. Assert no update timer or network request remains.

### F-02 (P0): Plugin authority is declarative, not enforceable

**Plan claim.** Parent PRD `PLUG-003` prohibits raw DB, filesystem, secrets, and arbitrary commands. The parent design states that the backend must derive plugin identity from a registered channel rather than trusting a caller-supplied ID. The host SDK design nevertheless sketches `PluginGuardRequest { plugin_id, capability }`.

**Gap.** There is no specified IPC/session/channel protocol that answers all of these questions:

- How is a frontend invocation bound to one installed plugin instance?
- Which code creates the unforgeable binding?
- How does Rust reject a user-supplied or stale `plugin_id`?
- How are asynchronous callbacks, scheduled work, and cancellation associated with that binding?
- How is the binding torn down during disable/reload?

A TypeScript context object and a request field are not an authority boundary. Current LitFolio Tauri commands are registered statically and receive broad application state; existing research correctly notes that `AppState` exposes the SQLite pool, paths, config, and services. The host design does not yet specify how that architecture stops being ambient authority for plugin code.

**NeuInk counterexample.** NeuInk's Rust `crates/neuink-ipc/src/commands/agent_runtime.rs` validates configured server IDs and allowed tool names, then launches an MCP process with workspace `current_dir`, inherited environment, stdio, and no shown user-confirmation gate. Its TypeScript type exposes `permissionMode: 'ask' | 'allow'` in `apps/desktop/src/shared/types/agentRuntime.ts`, but the backend execution path does not receive or enforce that mode. This is precisely the gap LitFolio must avoid: policy-shaped metadata without an execution-time reference monitor.

**Required amendment.** Add a "Plugin Invocation and Authority Contract" to the parent design before the SDK child starts:

```text
Plugin instance registration
  -> host issues opaque instance/session token
  -> host-owned adapter attaches token to each IPC/action request
  -> backend resolves token to immutable plugin identity + granted capability set
  -> backend checks a typed operation-specific grant
  -> backend returns typed result/error and records an audit event
```

The plugin must never receive raw SQL, filesystem roots, secret material, generic `invoke`, or a mutable authority object. The token must be opaque, scoped to one enabled instance, invalidated before disposer completion, and unavailable to arbitrary route code.

**Acceptance tests.**

- A plugin cannot access another plugin's scoped records by altering a plugin ID in a request payload.
- A disabled plugin's old token is rejected for reads, writes, schedules, and tool completions.
- A route outside the plugin host cannot issue a plugin-scoped backend command without a host-issued binding.
- Every denied operation has a stable machine-readable reason and an audit record that omits secret values.

### F-03 (P0): Manifest requirements contradict each other and cannot yet drive pruning

**Plan claim.** Parent PRD `PLUG-002` requires `id`, `version`, `displayName`, `activation entrypoint`, requested capabilities, dependencies, and schema-version metadata. The parent design's manifest interface includes no activation entrypoint. The host SDK and build-pruning designs add differing metadata ownership, frontend entries, and Cargo features later.

**Risk.** This produces multiple sources of truth before the first removable plugin exists. In particular, a build cannot reliably determine what to include, what frontend chunk to load, what backend commands/features to register, what migrations/schema upgrades apply, or how to activate the result.

**Required amendment.** Define one canonical manifest schema in the parent design, versioned and validated at build time and runtime. It must contain, at minimum:

```ts
interface PluginManifestV1 {
  apiVersion: 1;
  id: PluginId;
  version: Semver;
  displayName: string;
  activation: {
    frontend?: FrontendEntrypoint;
    backend?: BackendEntrypoint;
  };
  contributions: ContributionDeclaration[];
  requestedCapabilities: CapabilityRequest[];
  dependencies: PluginDependency[];
  storage: PluginStorageDeclaration;
  migrations: PluginMigrationDeclaration[];
  build: {
    frontendEntry?: string;
    rustFeature?: string;
  };
}
```

The actual field names can differ, but there must be exactly one schema and every child must consume it. Static validation must reject contradictory declarations, duplicate IDs, unresolvable dependency versions, undeclared backend entrypoints, and capabilities unsupported by the target.

**Acceptance tests.**

- A fixture manifest missing each required field fails with a field-specific diagnostic.
- A manifest declaring a backend contribution without a backend build entry fails before build.
- The selected-plugin registry, generated frontend entry list, Cargo feature list, and runtime plugin registry are generated from the same fixture manifest set and agree exactly.
- A release artifact built without a plugin contains neither its manifest nor its frontend/backend activation entrypoint.

### F-04 (P0): Legacy conversion depends on metadata introduced after conversion planning

**Plan claim.** The legacy converter design takes `includedPlugins` as an input and promises to copy only requested plugin-owned data. The build-pruning child later introduces the canonical plugin metadata and artifact inclusion manifest needed to determine that set.

**Risk.** The dependency graph is circular: conversion needs a stable inclusion model, while the inclusion model is deferred until after conversion-related planning. A converter created first will either hard-code IDs, duplicate the manifest, or infer ownership from legacy data. Each breaks the stated single source of truth.

**Required amendment.** Move canonical manifest and selected-plugin registry design/implementation ahead of legacy conversion. The converter must consume a resolved, versioned inclusion plan generated from the canonical manifests, not a manually assembled string array.

The conversion contract also needs an explicit answer for disabled-but-existing plugin data:

- Preserve it in plugin-scoped storage without activating it; or
- exclude it from the target library and retain a reversible source archive; or
- fail preview until the user chooses an explicit disposition.

Silent deletion or ambiguous "only requested data" behavior is unacceptable for a local-first migration.

**Acceptance tests.**

- Preview from the same source and manifest selection is deterministic, including counts and ownership classifications.
- A plugin omitted from the build cannot have its data activated or copied into core tables.
- A disabled but included plugin's data follows the documented disposition and can be restored/re-enabled without data loss.
- Applying a conversion with a stale inclusion-plan version fails before writes.

### F-05 (P1): The plan names capabilities but lacks an operation-level contract and consent model

**Plan claim.** The parent design offers capability names such as `paper.read`, `paper.write`, `ai.reading.ask`, `network.fetch`, `schedule.register`, `secrets.use`, and `tool.execute`. Source Discovery requires consent, observable schedules, cancellation, and host capability checks.

**Gap.** A capability string alone does not state scope, parameters, quota, data classification, consent time, UI disclosure, audit retention, or revocation effects. `network.fetch` is especially broad: host allowlists, redirect behavior, DNS/IP restrictions, payload limits, credential forwarding, and cache behavior are all missing. `secrets.use` has no description of allowed named secret references, whether a plugin can read a secret value, or how its provider request is visible.

**NeuInk counterexample.** NeuInk's Tauri capability file grants `http:allow-fetch` for all `https://**` URLs. Its provider module calls `tauriFetch` and can request OpenRouter model metadata (`OPENROUTER_MODELS_URL`) for model enrichment. The README's no-silent-model-download policy is valuable, but a broad transport permission remains too coarse for LitFolio's no-hidden-network promise.

**Required amendment.** Replace flat permissions with typed grants that define resource scope and interaction policy. For example:

```ts
interface NetworkFetchGrant {
  kind: 'network.fetch';
  hosts: readonly HostPattern[];
  methods: readonly ('GET' | 'POST')[];
  maxResponseBytes: number;
  userVisible: 'every-request' | 'approved-schedule';
  credentialRef?: SecretReferenceId;
}
```

The design should state that no capability implicitly grants another capability, redirects are revalidated, hosts are visible to the user at enable time, and a secret reference can be used only by a host-owned request adapter. The plugin never receives credentials.

**Acceptance tests.**

- A network-capable plugin cannot fetch an unapproved host or redirect to one.
- A plugin cannot read a secret value, log it, or attach it to an unapproved request.
- First use of an unapproved network operation is blocked with a host-owned consent UI and creates no request until approval.
- Revoking a capability invalidates scheduled work and in-flight retry behavior according to a documented policy.

### F-06 (P1): "Visible tool execution" is not a requirement in the Mono plan

**Plan claim.** The plan has lifecycle logging and diagnostics, while the product philosophy requires visible tool execution. It does not define a user-facing execution record for plugin operations, AI context hydration, network requests, scheduled refreshes, or failures.

**NeuInk strength.** NeuInk's assistant harness receives explicit UI context, creates a snapshot, hydrates evidence, emits agent-loop events, and persists messages. `apps/desktop/src/shared/ipc/assistantApi.ts` includes typed tool trace events with running/done/error states; `apps/desktop/src/components/assistant/ChatMessage.tsx` renders tool/context portions. `apps/desktop/src/assistant/sdk/tools.ts` emits tool events around execution. These are concepts worth adapting.

**Required amendment.** Add a core-owned, typed `ExecutionRecord` and `ExecutionEvent` contract. It must cover at least:

- initiating plugin/feature and trigger (`user`, `schedule`, `startup`),
- explicit input context identifiers and selection summaries,
- declared capability operation and target host/resource,
- running, cancellation-requested, cancelled, succeeded, and failed states,
- redacted result summary, timestamps, duration, and correlation ID.

The UI must make user-initiated tools observable while running and expose recent scheduled/network actions in diagnostics. The record must be owned by core so a plugin cannot suppress its own activity trail.

**Acceptance tests.**

- Starting a plugin tool produces a visible running state before the host operation begins.
- Success, denial, timeout, cancellation, and thrown errors create terminal records with stable states.
- Records show the context sources and network host without exposing prompt contents, document text, or secrets by default.
- Disabling a plugin leaves its historical records available but prevents new records for new work.

### F-07 (P1): User-driven context is underspecified and the AI proposal already weakens it

**Plan claim.** The parent design requires bounded current-paper context and says plugins add retrieval only through injected capabilities. The AI Reading child accepts `paperId`, question, and optional selection, but its description says only that selection is truncated. It has no typed context budget, provenance, user-visible context preview, or explicit opt-in for adding library retrieval.

**Risk.** "Bounded" becomes a length convention instead of a user-control boundary. The eventual Library Ask plugin can silently broaden a current-paper question into library-wide retrieval if the host contract does not distinguish the two at request construction.

**NeuInk strength.** NeuInk models assistant context as explicit UI state, attachments, selected text, active file, and contextual mentions, then snapshots/hydrates that context in the harness. Its architecture documentation describes the chain from user message and explicit UI context to evidence and proposal. LitFolio should adapt the typed provenance and display, not NeuInk's broad workspace-oriented default permissions.

**Required amendment.** Define an immutable `ContextEnvelope` passed to every AI/tool operation:

```ts
interface ContextEnvelope {
  origin: 'user-selection' | 'active-paper' | 'explicit-attachment' | 'plugin-retrieval';
  resourceRefs: readonly ResourceRef[];
  excerptBudget: TokenBudget;
  provenance: readonly ContextProvenance[];
  userApprovedAt?: ISODateTime;
}
```

The host constructs it. Plugins can request an expansion but cannot append arbitrary library material themselves. Expansion must show an explicit scope label such as "current paper", "selected passages", or "N retrieved library papers" before network/model dispatch.

**Acceptance tests.**

- A current-paper AI request sends only the selected/current-paper refs represented in its context envelope.
- A plugin cannot substitute a different paper ID or add library retrieval after the user approves context.
- Library-wide retrieval requires an explicit scope transition that is visible before dispatch.
- Persisted execution records identify context provenance and budget without persisting private excerpt text unnecessarily.

### F-08 (P1): Disable lifecycle has no concurrency and late-result semantics

**Plan claim.** The parent design orders disable as mark disabling, prevent new work, cancel tasks, run disposer, unregister contributions, revoke capabilities, then emit state. It does not define what happens to a non-cooperative task, an already-created write, a retry timer, a late network/model result, or a disposer failure.

**Risk.** A plugin can visibly be disabled but still mutate data or surface UI after a late completion. This directly violates removable and failure-isolated extensions.

**Required amendment.** Add a lifecycle state machine with generation/epoch checks and bounded shutdown:

```text
Disabled -> Enabling -> Enabled -> Disabling -> Disabled
                                \-> Failed
```

Every asynchronous operation must carry the plugin instance generation. Before any state mutation, publication, retry, or contribution update, host code compares it to the current enabled generation. Disable revokes the generation first, aborts cancellation-aware work, waits a bounded duration, records stragglers, and ignores late results. Disposer failures must not prevent authority revocation or contribution removal.

**Acceptance tests.**

- A deliberately delayed operation completes after disable and cannot write, show a toast, update a query cache, or register another timer.
- A disposer that throws still results in no active contributions, grants, schedules, or host subscriptions.
- Re-enable produces a new generation; old callbacks cannot affect it.
- A timeout during disable is recorded as a plugin fault but does not hang application shutdown.

### F-09 (P1): Source Discovery groups a high-risk network daemon with a low-risk local candidate view

**Plan claim.** One child owns both Candidate Inbox and Source Discovery. The latter includes polling schedules, remote fetches, metadata enrichment, candidate creation, and network capability controls.

**Risk.** Combining a local UI and remote automation creates a large first plugin that pressures the host to add schedules, network policy, persistence, notifications, migration, and cancellation at once. It also makes it harder to prove that disabling network behavior removes all periodic work.

**Required amendment.** Split this into two deliverables:

1. Candidate Inbox: local state, review, deduplication, and manual import only.
2. Source Discovery: optional remote adapters and user-approved schedules, built only after the execution/audit and typed network-grant contracts pass.

No source should poll or enrich metadata merely because its plugin is enabled. The initial state should be manual "Refresh" with a visible tool record. A schedule must be a separate, persisted user choice with its cadence, source, last run, and next run displayed.

**Acceptance tests.**

- Candidate Inbox works in a zero-network test environment.
- Enabling Source Discovery creates no network traffic or schedule until the user starts a refresh or enables a named schedule.
- Disabling Source Discovery removes all registered schedules and prevents queued retries.

### F-10 (P1): The SDK child is too broad to validate a small core

**Plan claim.** Mono Plugin Host + SDK owns host lifecycle, manifest registry, plugin repository, scoped storage, schema migration runner, capability guard, frontend slots, backend command composition, and tests.

**Risk.** This is a platform build disguised as a first extraction. It will likely accumulate the implicit contracts from every later plugin and leave no small vertical slice that tests removability. It also makes the new host the dominant application core before its security and lifecycle premises have been demonstrated.

**Required amendment.** Split host work into a minimal vertical slice and later capabilities:

1. Canonical manifest validation, static built-in registry, one UI slot, one read-only scoped service, lifecycle state machine, and execution records.
2. Then add durable plugin storage/migrations, backend command composition, secrets, network, schedules, and AI/tool capabilities one at a time behind contract tests.

Use one low-risk first-party plugin as the proof: Reader Annotations with local storage only. It should exercise activation, contribution registration, scoped storage, disable, and physical pruning without network, secrets, arbitrary commands, or library-wide retrieval.

**Acceptance tests.**

- The proof plugin can be included, enabled, disabled, re-enabled, and excluded from a release artifact using only the minimal host.
- The host binary/API surface does not add network, process-spawn, generic filesystem, raw database, or secret capabilities to support this proof.

### F-11 (P2): The plan does not set a process-tool boundary before discussing execution tools

**Plan claim.** Parent `PLUG-001` defers dynamic installation and forbids TCP/process RPC for the phase-one API. The design nevertheless reserves `tool.execute`, and the source discovery/AI/integration children will naturally want subprocesses, adapters, or developer tools.

**Risk.** This is a likely route for MCP-like scope inflation. NeuInk demonstrates why: the agent runtime starts configured MCP processes and forwards stdio. Even where configuration declares an `ask` mode, the backend path has no demonstrated per-invocation confirmation, cancellation, timeout, sandbox, or environment minimization. Copying this concept would conflict with the Mono requirement immediately.

**Required amendment.** State an explicit phase-one rule: no plugin capability may spawn a process, open a TCP listener, connect to a local daemon, or receive a generic shell/command adapter. `tool.execute` must be removed from V1 or renamed to a narrow, host-owned, typed operation with no arbitrary executable/path/argument fields. Any future process integration needs its own threat model, user confirmation model, timeout/cancellation model, working-directory/environment policy, and audit record.

**Acceptance tests.**

- Static policy test rejects manifests requesting `process.spawn`, shell, generic command, local socket, or MCP capabilities in V1.
- Build/runtime audit confirms no plugin-facing API exposes a generic Tauri `invoke`, Node child-process, or command runner.

### F-12 (P2): "Move legacy implementation" language conflicts with reversible conversion

**Plan claim.** Several extraction designs use "move" wording for legacy features. The conversion child is intended to be the only production switch and promises preview/apply/rollback.

**Risk.** A refactor that removes legacy behavior while plugin paths are incomplete will create a hidden production cutover before the converter has proven equivalence. It also makes rollback semantic rather than operational because source artifacts/data ownership may already be gone.

**Required amendment.** Replace "move" with "introduce plugin-owned implementation behind an inclusion flag; preserve legacy implementation until converter acceptance passes." The final conversion owns the only user-visible switch. Define parity fixtures and source-to-target data mapping before any legacy removal.

**Acceptance tests.**

- Each extracted feature has a fixture that runs the legacy and plugin implementation against the same input and compares the documented observable output.
- A failed conversion apply restores the legacy state without manual repair.
- The production switch cannot be reached until required selected plugins are present and their schema migrations have completed.

## NeuInk Concepts: Adopt, Adapt, Reject

### Adopt

| Concept | Evidence | LitFolio application |
| --- | --- | --- |
| Explicit context objects and snapshotting | NeuInk `apps/desktop/src/shared/types/assistant.ts` and `assistant/harness/engine.ts` model UI context and snapshot/hydration. | Host-owned `ContextEnvelope` with resource refs and provenance for AI and tools. |
| Visible execution trace state | NeuInk `shared/ipc/assistantApi.ts`, `assistant/sdk/tools.ts`, and `components/assistant/ChatMessage.tsx` use typed running/done/error tool events. | Core-owned execution timeline for tools, network requests, schedules, and failures. |
| Bounded agent-loop limits | NeuInk `shared/types/agentRuntime.ts` declares max tool calls/turns/time-like limits. | Per-operation budgets, cancellation, and explicit terminal states for future AI workflows. |
| Persisted evidence/proposals separate from apply | NeuInk architecture documents proposal, verification, persistence, and apply stages. | Conversion preview/apply and high-impact plugin actions should record a preview/evidence object before mutation. |

### Adapt Carefully

| Concept | Required adaptation |
| --- | --- |
| Assistant task state and evidence hydration | Construct it only from user-approved LitFolio resource references; never infer a workspace-wide context. |
| Provider abstraction | Route all remote calls through a host adapter with typed grants, visible records, per-host policy, and secret references rather than provider-owned fetches. |
| Tool traces | Make records core-owned and redacted. A plugin must not decide whether its operation appears in diagnostics. |
| Agent permissions | Treat permission fields as insufficient unless a backend reference monitor checks them at the exact operation boundary. |

### Reject for Mono V1

| NeuInk pattern | Reason |
| --- | --- |
| Static app command registry as a plugin model | NeuInk's Tauri handler is assembled at compile time for one app, not a removable capability-constrained extension host. |
| Broad HTTPS permission | `apps/desktop/src-tauri/capabilities/default.json` allows HTTP fetch for `https://**`; it conflicts with per-plugin host allowlists and no hidden network. |
| Frontend-controlled provider fetch/enrichment | `assistant/sdk/provider.ts` can request remote OpenRouter model metadata. LitFolio must surface and govern every network operation through the host. |
| MCP/process runtime for V1 | NeuInk starts configured processes using stdio and workspace current directory; this violates the Mono phase-one no-process-RPC stance and lacks the required execution controls. |
| Broad workspace tool authority | NeuInk agent settings include workspace-wide read/invoke authority. LitFolio plugins need resource-scoped, typed capabilities. |

## Required Parent Plan Amendments

### Parent PRD

Add these non-negotiable requirements before `CORE-006` and `PLUG-003` are considered satisfied:

1. **Runtime network invariant.** With no network-capable plugin enabled and no user-approved core exception, startup and idle operation generate zero network requests. Update behavior must be plugin-owned or explicitly consented.
2. **Host-mediated authority.** Every plugin operation is bound to an opaque host-issued instance token, checked in Rust against immutable grants. Plugin IDs supplied by callers are descriptive only and never authorize access.
3. **Canonical manifest.** One versioned schema is the source of truth for build inclusion, activation, contributions, capabilities, dependencies, storage, migrations, frontend entries, and backend features.
4. **Visible execution.** All network, AI/tool, scheduled, and privileged plugin operations emit core-owned execution records with trigger, context provenance, target summary, terminal state, and correlation ID.
5. **Explicit context.** AI and data-tool requests use host-constructed resource references and provenance. Plugin retrieval expansion requires visible user scope approval.
6. **V1 non-goals.** No process spawning, shell, generic command execution, TCP/local-daemon RPC, dynamic plugin installation, generic Tauri invocation, raw DB, raw filesystem, or secret-value access.
7. **Disable terminality.** Once disable begins, the plugin's authority generation is invalid. Late completions cannot mutate state, publish UI, retry, or schedule work.
8. **Conversion protection.** No legacy feature is removed or switched in production until conversion preview/apply/rollback and parity acceptance tests pass.

### Parent Design

Add four concrete sections:

1. **Plugin Invocation and Authority Contract**: token lifecycle, backend enforcement point, typed operation dispatch, revocation, audit fields, and denial errors.
2. **Canonical Manifest and Inclusion Compiler**: one schema, validation, generated registries, build metadata, and runtime registration inputs.
3. **Execution, Consent, and Context Model**: `ExecutionRecord`, `ContextEnvelope`, typed capability grants, consent UI ownership, redaction, schedule creation, and audit retention.
4. **Lifecycle State Machine**: enable/disable transitions, timeout/cancellation, generation checks, late-result disposal, and disposer fault behavior.

The parent design should also list allowed V1 operations. A narrower initial set is recommended:

- `paper.read` scoped to host-provided paper refs.
- `annotation.read` and `annotation.write` scoped by plugin-owned or host-mediated operations.
- `plugin.storage.read` and `plugin.storage.write` scoped to the current plugin namespace.
- `ui.contribute` limited to declared slots.

Defer `network.fetch`, `schedule.register`, `secrets.use`, `ai.reading.ask`, and any execution-tool capability until the foundational contracts and their tests exist. This is sequencing discipline, not permanent feature removal.

## Required Child Plan Amendments

| Child | Amendment |
| --- | --- |
| Mono Code Spec Foundation | Own canonical manifest V1, resource-ref/context types, execution event types, capability grant types, lifecycle states, and conformance fixtures. Do not leave these to host implementation prose. |
| Mono Core Boundaries | Inventory and move/gate `startAutoUpdateCheck()` before claiming zero-network startup. Add an automated startup network audit. |
| Mono Reader Annotations | Make this the first local-only proof plugin. Add inclusion/disable/pruning tests and prohibit it from expanding host capability scope. |
| Mono AI Reading Core | Define `ContextEnvelope`, context budget, scope-transition UX, cancellation semantics, execution records, and no implicit retrieval. Do not make `selection` merely a truncated optional string. |
| Mono Plugin Host + SDK | Split into a minimal host slice and later privileged capability additions. Specify opaque instance binding and backend reference-monitor tests before exposing plugin APIs. |
| Mono Plugin Source Discovery | Split Candidate Inbox from Source Discovery. Make discovery manual-refresh first; gate schedules/network behind typed grant, consent, audit, and cancellation contracts. |
| Mono Plugin Library Ask | Require explicit retrieval scope approval and provenance display. It must not introduce implicit library-wide context through the reader API. |
| Mono Plugin Research Workbench | Treat generated research as proposal/evidence output. It cannot gain generic filesystem/network/process capability to complete exports or source lookup. |
| Mono Plugin Knowledge Graph | Define local-only first implementation and data ownership. Avoid making graph extraction depend on discovery/network capability. |
| Mono Plugin Library Plus | Keep advanced library workflows local/scoped until host authority and conversion ownership are proven. |
| Mono Plugin Integrations | Separate credential-reference use from credential access. Add provider host allowlists, request visibility, revocation, and no background discovery. |
| Mono Legacy Conversion | Replace `includedPlugins: string[]` with a resolved, versioned inclusion plan from canonical manifests. Define omitted-plugin data disposition and parity/rollback fixtures. |
| Mono Build Pruning | Move canonical manifest/inclusion compiler work earlier. Build pruning should consume it, not define it after conversion planning. |
| Mono Integration + Release | Add release-level behavioral audits: no-network core boot, excluded-plugin artifact scan, disabled-plugin late-result test, manifest registry agreement, and execution-record coverage. |

## Revised Sequence

The current dependency graph starts broad host work too early and places build metadata after a converter that needs it. Use this sequence instead.

1. **Foundation and boundary repair**: canonical manifest V1/types, capability vocabulary, context/execution/lifecycle contracts; remove or gate core updater startup networking; write zero-network boot tests.
2. **Minimal host vertical slice**: static built-in registry, opaque plugin binding, backend reference monitor, one UI slot, local plugin storage, disable generation checks, execution records, and physical inclusion/pruning from the canonical manifest.
3. **Reader Annotations proof plugin**: extract local-only annotations; prove enable/disable/re-enable, no late effects, and a release build excluding it.
4. **Conversion prerequisites**: ownership mapping, resolved inclusion-plan compiler, preview/apply/rollback framework, legacy-vs-plugin parity fixtures. Do not switch production behavior yet.
5. **AI and optional remote capabilities**: introduce user-driven context envelope and AI reading; then source discovery/manual refresh, schedules, integrations/secrets, and retrieval plugins one capability family at a time.

This makes the first proof of the architecture small: a plugin can be truly included and removed, acts only through a typed host boundary, produces visible records, and cannot create network traffic. The more powerful plugins then consume proven contracts instead of defining them ad hoc.

## Acceptance Test Catalog

These tests should be named parent-level gates so child implementation cannot substitute weaker local checks.

### Core and Build Gates

- `core_boot_without_plugins_has_no_network_requests`
- `disabled_update_plugin_has_no_timer_or_network_request`
- `manifest_registry_build_entries_and_runtime_registry_agree`
- `excluded_plugin_is_absent_from_release_artifact`
- `plugin_manifest_validation_reports_actionable_field_errors`

### Authority and Lifecycle Gates

- `plugin_cannot_forge_identity_or_cross_plugin_storage_boundary`
- `plugin_operations_require_live_host_issued_instance_binding`
- `disable_revokes_authority_before_disposer_and_blocks_late_results`
- `disposer_failure_removes_contributions_and_records_fault`
- `plugin_cannot_access_raw_db_filesystem_secret_or_generic_invoke`

### Context, Network, and Visibility Gates

- `ai_request_uses_only_host_constructed_explicit_context`
- `retrieval_scope_expansion_requires_visible_user_approval`
- `network_capability_rejects_unapproved_hosts_and_redirects`
- `schedule_requires_explicit_user_enable_and_is_removed_on_disable`
- `privileged_plugin_operations_emit_redacted_execution_records`

### Conversion Gates

- `conversion_preview_is_deterministic_for_source_and_inclusion_plan`
- `conversion_rejects_stale_or_unknown_inclusion_plan`
- `conversion_apply_failure_restores_legacy_state`
- `legacy_and_plugin_parity_fixtures_match_before_production_switch`

## Plan Approval Gate

The parent plan is ready to start only after the design and affected child plans explicitly answer these five questions with testable contracts:

1. What exact component owns and gates every startup network request, including updater checks?
2. What unforgeable value binds a plugin invocation to an immutable backend capability grant?
3. What one manifest schema generates both runtime activation and build inclusion decisions?
4. How does the host make every privileged operation and its user-approved context visible without letting plugins suppress the record?
5. What happens to every in-flight operation, retry, timer, and late completion once disable starts?

Until then, extraction will likely create a visually modular application while retaining ambient authority, hidden network behavior, and non-removable runtime effects.

## Sources

- LitFolio Mono parent plan: `.trellis/tasks/07-23-litfolio-mono/prd.md`, `design.md`, and `implement.md`.
- LitFolio Mono child plans under `.trellis/tasks/07-23-litfolio-mono/`.
- LitFolio updater behavior: `src/main.tsx` and `src/lib/autoUpdate.ts`.
- NeuInk fixed checkout: `/tmp/litfolio-neuink-audit` at `11b848e0cfe9100a0386bcf2d4f3b839148d3b99`.
- NeuInk architecture and implementation: `docs/architecture/system-architecture.md`, `apps/desktop/src/assistant/harness/engine.ts`, `apps/desktop/src/assistant/sdk/tools.ts`, `apps/desktop/src/assistant/sdk/provider.ts`, `apps/desktop/src/shared/ipc/assistantApi.ts`, `apps/desktop/src/shared/types/agentRuntime.ts`, `apps/desktop/src-tauri/capabilities/default.json`, and `crates/neuink-ipc/src/commands/agent_runtime.rs`.
- Pi docs: `/home/zonazcy/.npm-global/lib/node_modules/@earendil-works/pi-coding-agent/README.md`, `docs/extensions.md`, `docs/packages.md`, and `docs/skills.md`.
