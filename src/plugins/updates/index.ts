import type { FrontendPluginEntry } from "@/host/pluginTypes";

export const pluginRoutes: FrontendPluginEntry["pluginRoutes"] = [];

export function activateUpdates() {
  return { pluginId: "updates", deactivate: () => undefined };
}
