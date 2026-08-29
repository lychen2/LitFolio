import { GraphPage } from "@/pages/GraphPage";
import type { FrontendPluginEntry } from "@/host/pluginTypes";

export const pluginRoutes: FrontendPluginEntry["pluginRoutes"] = [
  { path: "/graph", component: GraphPage },
];

export function activateKnowledgeGraph() {
  return { pluginId: "knowledge-graph", deactivate: () => undefined };
}
