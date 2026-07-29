# Startup Network

## Purpose

Record current updater/startup behavior and define the planned instrumented zero-egress contract for core boot and idle.

## Current Implementation

- `src/main.tsx` renders the React tree and then unconditionally executes `void startAutoUpdateCheck()`.
- In `src/lib/autoUpdate.ts`, `startAutoUpdateCheck()` uses a process-global `startupDone` guard. Outside Tauri it returns before transport or timer setup. In Tauri it dynamically loads updater/dialog/process plugins, runs a prompted update check, catches/logs bootstrap failures, and then calls `schedulePeriodic`.
- `schedulePeriodic` installs one `setInterval` at `6 * 60 * 60 * 1000` milliseconds. Each tick rebuilds Tauri dependencies and performs another prompted update check.
- `src-tauri/src/lib.rs` unconditionally installs `tauri_plugin_updater` and constructs shared `reqwest` clients during bootstrap.
- `src-tauri/src/startup.rs` currently performs database/filesystem startup and constructs clients; source inspection does not prove process-wide zero egress. Only an observer covering every transport can make that claim.
- `src/lib/autoUpdate.test.ts` unit-tests `runUpdateCheck` outcomes, progress, errors, and single-flight behavior through injected dependencies. It does not execute `startAutoUpdateCheck`, inspect the six-hour timer, boot React/Tauri, or observe backend egress. It is not zero-network conformance evidence.

The current app therefore does not meet the planned core-only zero-network startup invariant.

## Planned Parent Contract

**Planned and unimplemented.** Automatic update transport and scheduling belong to the independently removable `updates` integration. Core may expose an adapter for an explicit Settings action, but core boot cannot call or schedule it. An automatic schedule is allowed only when `updates` is included, runtime-enabled, visibly persisted, and authorized after the required explicit user action/consent.

The shared target fixture is [`startup-network.json`](./fixtures/mono-v1/startup-network.json). It defines two conformance scenarios and positive controls.

### Observation boundary

Observe attempted egress, including denied, CSP-blocked, cached, and failed attempts, at all of these boundaries:

- frontend `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, and `navigator.sendBeacon`;
- lower-level WebView/process request interception for external image, stylesheet, media, frame, and worker resources;
- lower-level WebView/process top-level and frame navigation policy callbacks, plus page security-policy violation evidence for CSP-denied external URLs that do not reach transport;
- Tauri updater check/download transport and any plugin transport adapter;
- backend API/external `reqwest` execution and every future host network adapter;
- updater/network-capable schedule or retry timer registration.

Each observed attempt records phase (`cold-boot`, `readiness`, or `idle`), owner (`core` or plugin principal), transport/resource kind, operation, redacted destination, and correlation ID. WebView/process interception is installed before app import and records URL-bearing resource/navigation initiation before cache, CSP, DNS, or transport success can hide it. CSP violation observation is additive because a blocked resource can be visible to the document without reaching the process transport callback. Instrumentation cannot log secrets or content. A discovered path that bypasses all observers blocks conformance until it is instrumented and assigned an owner; conformance does not rely on an assertion-only "unobserved count."

Each scenario result must repeat the complete installed observer list, reached readiness milestones, and observed phases. Missing input coverage or a result that merely reports zero without those fields fails fixture validation.

### Scenario window

1. Install observers before importing/starting the app and enable fake time for frontend timers.
2. Start a production-shaped core-only app with a temporary migrated library, no optional plugin registry entries, and no AI profile.
3. Wait for Library readiness, open a fixture paper, and wait for Reader/PDF readiness without invoking an AI/network action.
4. Advance and settle a 30-second idle window, including queued microtasks and timers.
5. Assert exactly zero observed frontend, WebView/process resource/navigation/CSP, updater, backend, schedule, and retry attempts. Also assert no updater/network-capable timer was registered.

The disabled-`updates` scenario includes the plugin in the artifact but persists it disabled before boot. It runs the same readiness/idle window and expects zero contributions, bindings, updater timers, and network attempts.

### Positive controls

Every declared observer has exactly one positive-control ID. IDs and observer assignments are unique. Each control deliberately exercises its boundary with a unique external sentinel URL during a declared phase and records matching evidence with the same control ID, observer, resource kind where applicable, phase, and an observed count at or above its positive minimum. This includes all frontend primitives, WebView/process image/style/media/frame/worker requests, process navigation, CSP-denied attempts, updater transport, both backend clients, the host adapter, and network-capable timer registration. A missing, duplicate, dead, mismatched, or invisible control invalidates the zero count with `network_observer_invalid`.

## Source Examples

Current: `src/main.tsx`, `src/lib/autoUpdate.ts`, `src/lib/autoUpdate.test.ts`, `src-tauri/src/lib.rs`, and `src-tauri/src/startup.rs`.

Planned authority: `.trellis/tasks/07-23-litfolio-mono/design.md`, `.trellis/tasks/07-23-mono-core-boundaries/design.md`, and `.trellis/tasks/07-23-mono-plugin-integrations/design.md`.

## Validation

Current audit:

```bash
pnpm test -- src/lib/autoUpdate.test.ts
rg -n 'startAutoUpdateCheck|PERIODIC_MS|setInterval|plugin_updater|reqwest::Client' src/main.tsx src/lib/autoUpdate.ts src-tauri/src
```

Target fixture consistency includes named negative mutations that remove an observer, lower-level WebView/process coverage, readiness milestone, phase, expected scenario, positive control, or reported observer; duplicate a control ID/observer; or tamper with observer/control evidence. Each mutation must fail with its pinned path and startup-network error code:

```bash
python3 .trellis/spec/cross-layer/fixtures/mono-v1/validate.py
```

Executable target recipe for `mono-core-boundaries` and later integration gates:

```bash
pnpm test -- -t 'core_boot_without_plugins_has_no_network_requests'
pnpm test -- -t 'disabled_update_plugin_has_no_timer_or_network_request'
cargo test --manifest-path src-tauri/Cargo.toml core_boot_without_plugins_has_no_network_requests
```

Those test names and commands are reserved target recipes. They cannot be reported as passing until the owning task adds the harness, runs both readiness/idle scenarios, and proves all positive controls.

## Anti-Patterns

- Keeping `startAutoUpdateCheck()` in a core provider or app entrypoint and renaming it an integration.
- Treating `isTauri()` or a mocked updater unit test as process-wide zero-egress proof.
- Counting only successful requests; attempts and denied dispatches must be visible.
- Observing frontend `fetch` while missing WebView/process resource loads, navigation, CSP-denied attempts, updater transport, or backend clients.
- Accepting a declared zero for supposedly unobserved paths as evidence of observer completeness.
- Allowing an enabled plugin to create a hidden schedule during activation.
- Accepting a zero count when any positive control is unobserved.

## Related Specs

- [Cross-Layer Index](./index.md)
- [Canonical Target Mono Contracts](./mono-contracts.md)
- [Plugin Capabilities](./plugin-capabilities.md)
- [Performance Contracts](./performance-contracts.md)
