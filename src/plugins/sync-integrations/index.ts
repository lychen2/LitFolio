import type { FrontendPluginEntry } from "@/host/pluginTypes";

export const pluginRoutes: FrontendPluginEntry["pluginRoutes"] = [];

export function activateSyncIntegrations() {
  return { pluginId: "sync-integrations", deactivate: () => undefined };
}
