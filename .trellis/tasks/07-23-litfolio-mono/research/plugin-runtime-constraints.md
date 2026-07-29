# Plugin Runtime Constraints

## Product Decisions

- Phase one supports source/build-time inclusion plus runtime enable/disable.
- It exposes a typed custom-plugin API but does not load arbitrary runtime packages or binaries.
- A local TCP port is not part of the plugin API.
- Signed installation, package download, and physical runtime uninstall are deferred.
- Plugin data is retained on disable and recoverably archived when the plugin is absent during conversion.

## Current Constraints

### Frontend

- Routes are statically declared in `src/App.tsx`.
- Navigation is statically declared in `src/lib/navigationRegistry.ts`.
- `CommandPalette` reads the same static registry.
- `Shell` directly queries topic-alert state and global storage totals.
- `GlobalOnboarding` directly queries Projects and includes an optional-feature step.
- The global `api` surface lets core UI call optional commands without an ownership boundary.
- Vite has route-level lazy chunks but no build-time plugin inclusion registry.

### Backend

- All commands enter one compile-time `tauri::generate_handler!` list.
- `AppState` exposes the main pool, library paths, HTTP clients, and cross-feature locks to command modules.
- Cargo has no first-party feature matrix; optional-feature dependencies are unconditional.
- Data from core and optional workflows shares `library.db`.

These facts mean a UI toggle alone cannot satisfy disable, isolation, or pruning requirements.

## Phase-One Host Shape

The host validates manifests before activation, constructs least-privilege capability objects, opens the plugin sidecar only after compatibility/migration checks, and publishes contributions only after successful activation.

A plugin cannot:

- import a core repository implementation;
- issue arbitrary Tauri command names;
- open `library.db` directly;
- inspect another plugin directory;
- enumerate unrelated secrets or AI profiles;
- register an undeclared route/action/job;
- leave event listeners, jobs, or handles active after disable.

## Inclusion Versus Enablement

| State | Code in artifact | Contributions visible | Commands usable | Data |
| --- | --- | --- | --- | --- |
| excluded | no | no | unregistered | preserved/archive discovered by converter |
| included + disabled | yes | no | guarded as disabled | retained, closed |
| included + enabled | yes | yes | capability-guarded | opened after migration |
| failed/incompatible | yes | no | structured failure | unchanged or rolled back |

## Capability Design Constraints

Capabilities are narrow service interfaces, not bags of framework internals. Requests carry the caller plugin ID from host-owned context, not a forgeable frontend parameter.

High-risk scopes:

- `network`: host allowlist/scheme policy, cancellation, timeout, and audit attribution;
- `files`: plugin root by default, explicit user-selected grants for external paths;
- `secrets`: namespace and key-specific access without returning unrelated values;
- `jobs`: plugin-owned kinds, cancellation on disable, no core job mutation;
- `events`: typed event allowlist and automatic subscription disposal;
- `ui`: only declared slots and contribution IDs.

## Lifecycle Failure Cases

The host and fixture plugin must test:

- incompatible core API before activation;
- missing or disabled dependency;
- requested capability denied;
- sidecar migration failure and rollback;
- activation throwing after partial registration;
- duplicate contribution IDs;
- disable during an in-flight job;
- disposer throwing;
- repeated enable/disable without leaked listeners or duplicated UI;
- application shutdown while plugins are enabled.

## Build Constraints

A deterministic plugin manifest must drive both Rust and TypeScript inclusion. Cargo features own native modules/dependencies and Vite owns frontend entry imports. The supported matrix must fail fast if the two sides disagree.

Bundle verification checks actual artifacts/dependency trees. The absence of a nav item or route at runtime does not demonstrate removal.
