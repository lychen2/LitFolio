//! Local fixture plugin: zero-network UI contribution demo.
//!
//! Exports match `plugins/fixture-local/manifest.json`:
//! - `activateFixtureLocal` — activation entry (activation.frontend.export)
//! - `renderToolbarButton`  — library.toolbarActions contribution

import type { FrontendPluginEntry } from "@/host/pluginTypes";

export const pluginRoutes: FrontendPluginEntry["pluginRoutes"] = [];

export interface FixtureActivation {
  pluginId: string;
  deactivate: () => void;
}

let active = false;

export function activateFixtureLocal(): FixtureActivation {
  active = true;
  return {
    pluginId: "fixture-local",
    deactivate: () => {
      active = false;
    },
  };
}

export function isFixtureActive(): boolean {
  return active;
}
