import { lazy } from "react";
import type { PluginRoute } from "@/host/pluginTypes";

// Profile registration reads the route without loading the graph page.
export const renderNetworkRoute = lazy(() => import("@/features/literature-network").then((module) => ({ default: module.LiteratureNetworkPage })));

export const pluginRoutes: readonly PluginRoute[] = [
  { path: "/literature-network", component: renderNetworkRoute },
];

export function activateLiteratureNetwork() {
  return { pluginId: "literature-network", deactivate: () => undefined };
}
