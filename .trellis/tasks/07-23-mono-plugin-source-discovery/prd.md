# Extract Source, Discovery, and Candidate Plugins

## Goal

Move network source import, ongoing discovery/feed workflows, and the local candidate review workflow out of core into three independently declared first-party plugins: `source-connectors`, `discovery-feeds`, and `candidate-inbox`.

## Dependencies

- `mono-plugin-host-sdk` is completed and archived.
- Core local PDF/BibTeX import and paper capabilities are stable.

## Requirements

- `source-connectors` owns DOI, arXiv, remote search, remote PDF acquisition, and connector-provided import-source contributions.
- `discovery-feeds` owns RSS feeds, Browse/Topic workflows, topic alerts, recommendations, feed metadata, query expansion, topic survey actions, and network-origin candidate proposals.
- `candidate-inbox` owns local candidate records, review/seen state, deduplication decisions, inbox UI/actions, and conversion of an approved candidate through an available public import contribution. It has no network, secret, or schedule grant.
- Core retains local PDF/BibTeX import and works with all three plugins excluded or disabled. `candidate-inbox` remains usable when `discovery-feeds` is disabled and can receive candidates from any authorized public producer.
- Register routes, navigation, command-palette entries, import sources, settings, jobs, and notifications exclusively through plugin slots.
- Move plugin-owned tables from migrations `0006`, `0016`, `0022`, `0025`, `0027`, and `0028` into sidecar migrators without editing historical migrations.
- Attribute every network request and scheduled refresh to the owning plugin in a host-owned, redacted execution record; core startup performs none.
- Require a successful user-triggered manual refresh, with destination and transferred-data disclosure, before a plugin may offer or register a schedule. Changing its endpoint, disclosure, or relevant grant invalidates that eligibility.
- Guard all backend commands and cancel feed/discovery jobs on disable while preserving sidecar data. Every job, retry, callback, commit, and result publication binds to the plugin instance generation and rejects late results after revocation.
- Use core paper/job/event capabilities for imports and linking; no plugin opens `library.db`.
- Keep the three plugins independently enableable. Discovery submits candidates only through a typed public candidate capability; candidate-to-connector actions appear only when a compatible source contribution is available, not through an internal import.
- Use typed grants: network grants constrain operation, methods, schemes, hosts, redirects, quotas, and consent; secret grants expose only host-resolved references for named request fields; file grants expose only user-approved or host-staged opaque handles. No plugin receives raw paths or secret values.

## Constraints

- Preserve current imported papers, candidate/feed state, seen flags, alerts, and metadata through the final legacy converter.
- Do not move current-paper AI Reading into any of these plugins.
- No automatic refresh on core startup. Schedules remain unavailable until manual-refresh eligibility is recorded, and then must be explicit, observable, cancellable, recoverable, and revocable by plugin generation.
- Network disclosure identifies the destination, data categories, paper/content scope, credential use, retention assumption when known, and whether data leaves the device before consent or dispatch.

## Out of Scope

- Full-library RAG/Ask, graph data, project research, and library-plus tools.
- Third-party connector download/marketplace.
- Final build dependency pruning beyond plugin-owned entry declarations.

## Acceptance Criteria

- [ ] Core-only build/import flow has no DOI/arXiv/feed/discovery/candidate routes, commands, jobs, or startup network calls and local PDF/BibTeX import still works.
- [ ] Each of the three canonical manifests/entrypoints enables or disables independently and all owned contributions/jobs/commands appear and disappear atomically.
- [ ] Candidate review, seen state, and approved local conversion work with `discovery-feeds` disabled; `candidate-inbox` performs no network request and accepts discovery output only through its public capability.
- [ ] DOI/arXiv/search import parity and RSS/Browse/Topic/Candidate/alert parity pass against existing fixtures.
- [ ] Sidecar migrations preserve feed/candidate/alert/recommendation data and rollback on injected failure.
- [ ] Schedules cannot be registered before a successful disclosed manual refresh; endpoint/grant changes revoke eligibility, and no plugin network call occurs during core startup.
- [ ] Disable during refresh/import cancels work without partial core paper records or lost plugin data; stale-generation retries, commits, and results are rejected.
- [ ] Typed network/secret/file grants, data-transfer disclosures, host-owned redacted execution records, and structured disabled/denied errors are enforced.
- [ ] Typecheck, lint, Vitest, relevant Cargo tests, plugin lifecycle tests, and source/discovery E2E pass.

## Source Anchors

- `src/pages/ImportPage.tsx`, `BrowsePage.tsx`, `FeedsPage.tsx`, `TopicPage.tsx`, `CandidateInboxPage.tsx`
- `src/pages/feeds/`, `src/pages/topic/`, `src/components/candidates/`
- `src-tauri/src/commands/imports.rs`, `feeds.rs`, `candidates.rs`, `topic_alerts.rs`, `discovery.rs`
- `src-tauri/src/ingest/arxiv.rs`, `ingest/doi.rs`, `storage/feeds/`, `storage/candidates.rs`, `storage/topic_alerts.rs`
- migrations `0006`, `0016`, `0022`, `0025`, `0027`, `0028`
