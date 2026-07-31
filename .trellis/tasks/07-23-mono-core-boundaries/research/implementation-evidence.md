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

## Network Evidence (Final)

The process-wide zero-network gate is implemented and passing. `src-tauri/tests/startup_network_process.rs` spawns the real Tauri app (`CARGO_BIN_EXE_litera`) under `unshare --user --map-root-user --net` (isolated network namespace) with `xvfb-run` and `strace -ff -e trace=network`, so every syscall-level egress attempt is captured in addition to the app observers.

Observed boundaries (all 17 from the startup-network fixture):

- Frontend `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, and `navigator.sendBeacon`, injected before app boot via `js_init_script`, plus `securitypolicyviolation` CSP evidence.
- Tauri updater transport: `internals.invoke` interception of `plugin:updater|*`. The `updates-included-disabled` scenario actually installs `tauri_plugin_updater` in the artifact (included) but never activates it (disabled), and still records zero updater attempts, timers, or bindings.
- Backend api and external `reqwest` clients: positive controls send real denied requests to `http://203.0.113.1:9` through `app_state.http` / `app_state.http_external`, which the syscall observer sees as `sin_port=htons(...)` sentinel connections.
- `host.network-adapter` denied adapter, `scheduler.network-capable-timer` registration, WebView/process image/style/media/frame/worker resource loads (`connect_resource_load_started`), top-level navigation (`on_navigation`), and CSP-denied attempts.
- Process-wide: `strace` network trace proves the zero scenarios made no syscall-level network attempts at all.

Scenarios run: `core-only-cold-boot-and-idle` (zero + positive-controls) and `updates-included-disabled-cold-boot-and-idle` (zero). Both zero scenarios reach `library-ready` and `reader-pdf-ready`, settle a 30-second idle window, and assert `attempted_egress_count == 0` with empty attempts. Every one of the 17 positive controls is asserted observed in its pinned phase, plus the strace sentinel checks. The two process-level tests are serialized through a shared `PROCESS_GATE` mutex because parallel WebKitGTK harness instances race on shared WebKit data directories (observed as one of the two tests failing with exit 1 whenever run concurrently; both pass in isolation and serialized).

Implementation checklist item 9, the PRD acceptance item, and the reserved recipes `core_boot_without_plugins_has_no_network_requests` and `disabled_update_plugin_has_no_timer_or_network_request` are therefore complete.
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
cargo test --manifest-path src-tauri/Cargo.toml --test startup_network_process
# 2 passed; ~75s (serialized); repeated runs stable
pnpm exec playwright test e2e/app-smoke.spec.ts --grep "loads library, import, reader, and settings routes|core AppRoot reaches Library and Reader readiness"
# focused route/network checks passed

python3 ./.trellis/scripts/task.py validate .trellis/tasks/07-23-mono-core-boundaries
# implement.jsonl: 9 entries; check.jsonl: 8 entries; passed

git diff --check
git diff --name-only -- src-tauri/migrations
# passed; no migration changes
```

The earlier `pnpm test:e2e -- --grep ...` placeholder selected zero tests and is not evidence. The correct direct Playwright command is recorded above.

## Final Status - 2026-07-28

All acceptance criteria and implementation checklist items are complete and verified. The zero-network gate runs the production-shaped app under an isolated network namespace with syscall-level tracing, all 17 positive controls observed, both fixture scenarios passing, and no SQL migration or user-owned change modified. See the network section above for the gate details; the verified commands section records the passing validation suite.
