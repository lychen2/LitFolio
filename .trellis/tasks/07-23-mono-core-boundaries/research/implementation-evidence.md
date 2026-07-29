# Implementation Evidence

## Reconciliation Snapshot

Evidence was reconciled against the current dirty worktree on 2026-07-28. Product changes outside this task were inspected but not reverted or staged. `git diff --name-only -- src-tauri/migrations` was empty.

Implemented boundaries include `src/app`, `src/core`, `src/features`, `src/plugins`, `src/plugin-sdk`, and `src/host`; negative import fixtures enforce the intended public entrypoints. `src/App.tsx` and `src/pages/ReaderPage.tsx` are compatibility entrypoints into app and Reader assembly. Core library, Reader, and AI Reading clients delegate to the existing typed command/parser owners, while `src/lib/api.ts` remains the broad compatibility aggregation surface.

## Temporary Adapters

| Adapter | Current purpose | Removal owner |
| --- | --- | --- |
| `src/App.tsx` | Preserves the historical `App` import while assembly lives in `src/app/AppRoutes.tsx` | `mono-plugin-integrations` after route contribution assembly replaces the static compatibility entrypoint |
| `src/pages/ReaderPage.tsx` | Preserves the route page import while `ReaderAssembly` lives in `src/features/reader` | `mono-reader-annotations` after Reader composition callers migrate |
| `src/lib/api.ts` | Preserves the global `api` aggregation while migrated methods come from core clients | `mono-plugin-integrations` after remaining domain callers migrate |
| `src/core/data/libraryClient.ts` | Delegates to the existing library command/parser owner | `mono-plugin-library-plus` after its callers and optional surfaces migrate |
| `src/core/data/readerClient.ts` | Delegates Reader document/annotation operations | `mono-reader-annotations` |
| `src/core/data/aiReadingClient.ts` | Delegates bounded AI Reading operations | `mono-ai-reading-core` |
| `src/plugins/updates/compatibility.ts` | Keeps explicit Settings-only manual update checks reachable | later `updates` extraction in `mono-plugin-integrations` |

## Network Evidence And Limits

Current executable observation covers:

- Unit-level frontend `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, timeout, and interval registration, each with a positive control.
- Playwright browser request events and top-level navigation while Library and Reader become ready and fake time advances 30 seconds.
- A denied Rust host request adapter during temporary-library bootstrap, Library/Reader repository readiness, and 30 seconds of paused Tokio time, with one adapter positive control.

This is not process-wide zero-egress evidence. The observer is not connected to raw domain `reqwest` clients or Tauri updater transport, and it does not observe lower-level WebView/process resource loads, frame navigation, CSP violations, cache-hidden attempts, or every retry/schedule path. The disabled-`updates` artifact scenario is also absent. Therefore implementation checklist item 9 and the corresponding PRD acceptance item remain open.

## Verified Commands

```bash
pnpm typecheck
pnpm lint:strict
pnpm test
# 56 test files, 275 tests passed

cargo test --manifest-path src-tauri/Cargo.toml --test mono_contract_fixtures --test mono_manifest_fixtures
# 7 tests passed

cargo test --manifest-path src-tauri/Cargo.toml mono_contracts::job
# 2 passed, 323 filtered

cargo test --manifest-path src-tauri/Cargo.toml core_boot_host_adapter_observes_no_dispatch_until_called
# 1 passed, 324 filtered

pnpm exec playwright test e2e/app-smoke.spec.ts --grep "loads library, import, reader, and settings routes|core AppRoot reaches Library and Reader readiness"
# focused route/network checks passed

python3 ./.trellis/scripts/task.py validate .trellis/tasks/07-23-mono-core-boundaries
# implement.jsonl: 9 entries; check.jsonl: 8 entries; passed

git diff --check
git diff --name-only -- src-tauri/migrations
# passed; no migration changes
```

The earlier `pnpm test:e2e -- --grep ...` placeholder selected zero tests and is not evidence. The correct direct Playwright command is recorded above.

## Pause Checkpoint - 2026-07-28

Implemented and passing: app/provider/route assembly, Reader feature assembly, typed core clients and compatibility exports, TypeScript/Rust canonical contract consumers, import-boundary tests, Settings-only updater compatibility, removal of startup/periodic updater work, frontend transport observation, Playwright browser request/navigation observation, and the Rust host-network adapter positive control.

Remaining blocker: checklist item 9 requires process-wide zero-egress evidence. Raw domain `reqwest`, Tauri updater transport, lower-level WebView/process resources/navigation/CSP, every retry/schedule path, and the disabled-`updates` artifact scenario are not yet connected to one complete observer. Do not archive or mark AC 7 complete until that evidence exists.

Resume with a medium-strength implementation/check pass focused only on process-wide egress instrumentation. Do not reopen already passing contract, API, Reader, or route work unless the zero-network integration requires it.
