//! Library Ask plugin entry.
//!
//! Exports match `plugins/library-ask/manifest.json`:
//! - `activateLibraryAsk` — activation entry (activation.frontend.export)
//! - `renderAskRoute`     — app.routes contribution (the full-library RAG page)

import { AskPage } from "./AskPage";
import type { FrontendPluginEntry } from "@/host/pluginTypes";

export { AskPage as renderAskRoute };

export const pluginRoutes: FrontendPluginEntry["pluginRoutes"] = [
  { path: "/ask", component: AskPage },
];

let active = false;

export function activateLibraryAsk(): { pluginId: string; deactivate: () => void } {
  active = true;
  return {
    pluginId: "library-ask",
    deactivate: () => {
      active = false;
    },
  };
}

export function isLibraryAskActive(): boolean {
  return active;
}
