import type { FrontendPluginEntry } from "@/host/pluginTypes";

export const pluginRoutes: FrontendPluginEntry["pluginRoutes"] = [];

export function activateSourceConnectors() {
  return { pluginId: "source-connectors", deactivate: () => undefined };
}
