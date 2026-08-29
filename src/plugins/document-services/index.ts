import type { FrontendPluginEntry } from "@/host/pluginTypes";

export const pluginRoutes: FrontendPluginEntry["pluginRoutes"] = [];

export function activateDocumentServices() {
  return { pluginId: "document-services", deactivate: () => undefined };
}
