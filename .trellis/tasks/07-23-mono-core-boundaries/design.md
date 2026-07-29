# Establish Mono Core Boundaries - Design

## 1. Scope / Trigger

This is the first application-source child. It creates enforceable ownership and migration adapters while preserving the current product. It runs after source-backed specs exist and before Reader, AI, or plugin extraction.

## 2. Signatures

Target frontend ownership:

```text
app/          boot, providers, shell and route assembly
core/         library, reader, annotations, AI Reading domain/data contracts
features/     core feature presentation assembled by app
plugins/      first-party plugin implementation roots
plugin-sdk/   public extension value types only at this stage
```

Minimum stable contract ownership at this stage:

```text
core/contracts       core domain IDs, ResourceRef values, structured domain errors
plugin-sdk/contracts canonical PluginManifestV1 declarations and public plugin value types
host/contracts       JobId, JobOwner, JobState, sequenced JobEvent, cancellation and terminal results
```

The TypeScript and Rust representations consume the foundation's versioned JSON fixtures. They do not independently redefine the manifest schema. `PluginManifestV1.requestedCapabilities` is declarative; neither it nor a caller-provided plugin ID grants runtime authority. Live instance bindings, grant issuance, activation, disable, and privileged dispatch remain owned by `mono-plugin-host-sdk`.

Typed IPC client shape:

```ts
interface CommandSpec<Args, Result> {
  command: string;
  parse(result: unknown): Result;
}

function invokeCommand<Args, Result>(
  spec: CommandSpec<Args, Result>,
  args: Args,
): Promise<Result>;
```

Domain clients expose named methods. Route/components do not construct raw command names or parse unknown payloads.

## 3. Contracts

- `app` may compose core/features and stable SDK types.
- `core` imports only core/shared stable value modules.
- `features` may import public core contracts, never storage implementations from another domain.
- `plugins` may import `plugin-sdk` and their own implementation; host/capabilities arrive later.
- `plugin-sdk` cannot import React page modules, Tauri internals, or core repositories.
- Core resource/domain contracts cannot depend on plugin declarations. Plugin/job contracts may reference stable opaque core IDs but cannot expose repository, SQLx, filesystem-root, secret-value, generic invoke, process, or socket types.
- A job owner is discriminated as core or plugin-instance-owned. Plugin ownership includes immutable plugin ID plus generation for later host binding; events have monotonic sequence numbers, cancellation is observable, exactly one terminal outcome is accepted, and post-terminal events are rejected by fixture consumers.
- Old `api` exports are compatibility-only and delegate to one typed owner.
- Command names, camel/snake argument mapping, runtime parsers, Rust registration, and Tauri mocks change atomically.
- Structural moves preserve route paths, query keys, persisted local-storage keys, and i18n keys unless a later task owns the change.

### 3.1 Startup Network Ownership

Current behavior is explicit migration input: `src/main.tsx` unconditionally calls `startAutoUpdateCheck()`, which invokes updater transport during Tauri boot and registers a six-hour timer. The target core app entrypoint does neither.

During this child, manual Settings update checking remains available through an `updates`-owned compatibility boundary. Automatic startup and periodic checks are disabled until the removable `updates` integration can activate from explicit user action or a persisted, independently enabled schedule. Merely wrapping `startAutoUpdateCheck()` in a core provider or environment check does not satisfy ownership.

The network audit has two layers:

1. A deterministic frontend test uses fake time to boot the core-only app, reach Library and Reader readiness, advance a 30-second idle window, and assert no updater call, network primitive, or network timer is registered.
2. A Tauri integration harness observes attempted egress through updater transport and backend host request adapters over the same boot/readiness/idle scenario. A positive control invokes a denied fake update/network request and must increment the observer, proving that zero is measured rather than assumed.

Any discovered startup egress path outside an observable host adapter fails the gate until it is instrumented and assigned to core user action or an optional integration owner.

## 4. Validation & Error Matrix

| Condition | Result |
| --- | --- |
| forbidden import | lint/boundary test fails with source and target layer |
| duplicate API implementation | review/test failure; keep one owner and re-export |
| parser rejects current backend fixture | focused API schema test fails |
| frontend command lacks Rust registration/mock | parity test fails |
| adapter cycle | typecheck/boundary test fails; split stable value type owner |
| manifest/domain/plugin/job fixture differs in TypeScript and Rust | conformance failure; fix the single owner/consumer, not the fixture locally |
| caller ID or manifest request treated as a grant | authority-boundary failure |
| duplicate or post-terminal job event | parser/state-machine fixture failure |
| boot/idle network attempt or updater timer | zero-network failure with observed owner/transport |
| network observer misses positive control | invalid test harness; zero result cannot be claimed |
| behavior changes during move | smoke test fails; restore adapter before continuing |

## 5. Good / Base / Bad Cases

- Good: `ReaderPage` imports a Reader assembly component/controller contract and route params only.
- Base: a legacy caller imports `api.paperGet`, which delegates to `core/library/api` with a removal note.
- Good: TypeScript and Rust parse the same canonical manifest/job fixtures while host behavior remains deferred.
- Good: Settings can trigger a manual update through the compatibility owner, while app boot and fake-time idle register no updater transport or timer.
- Bad: `core/reader` imports `plugins/library-ask` to ask a selected-text question.
- Bad: `app` retains `startAutoUpdateCheck()` because updater code has not yet been extracted into a full plugin.

## 6. Tests Required

- New import-boundary tests or ESLint rules with positive and negative fixtures.
- Shared `PluginManifestV1` and domain/plugin/job fixture conformance tests in TypeScript and Rust, including invalid authority, sequence, cancellation, and terminal cases.
- Existing `apiSchema`, command-parity, navigation, page smoke, and Reader-focused tests.
- `core_boot_without_plugins_has_no_network_requests` and `disabled_update_plugin_has_no_timer_or_network_request`, with a network-observer positive control.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`.
- Focused Playwright routes for Library, Reader, Import, and Settings.
- A diff assertion/review showing no SQL migration changes.

## 7. Wrong vs Correct

Wrong:

```ts
// core/reader/actions.ts
import { askLibrary } from "@/plugins/library-ask/internal";
```

Correct:

```ts
// core/reader/controller.ts
import type { ReadingAiGateway } from "@/core/ai-reading/contracts";

export function createReaderController(ai: ReadingAiGateway) {
  // The core bounded AI gateway is injected by app assembly.
}
```

The same rule applies to jobs and manifests: core code may consume stable values, but only the later host can turn a validated declaration into live authority or plugin-owned execution.
