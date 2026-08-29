import type { FrontendPluginEntry } from "@/host/pluginTypes";

export const pluginRoutes: FrontendPluginEntry["pluginRoutes"] = [];

export function activateLibraryPlus() {
  return { pluginId: "library-plus", deactivate: () => undefined };
}
