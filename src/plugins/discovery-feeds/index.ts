import { lazy } from "react";
import type { PluginRoute } from "@/host/pluginTypes";

// Keep each page behind its own route, even within this plugin.
const BrowsePage = lazy(() => import("@/pages/BrowsePage").then((module) => ({ default: module.BrowsePage })));
const FeedsPage = lazy(() => import("@/pages/FeedsPage").then((module) => ({ default: module.FeedsPage })));
const TopicPage = lazy(() => import("@/pages/TopicPage").then((module) => ({ default: module.TopicPage })));

export const pluginRoutes: readonly PluginRoute[] = [
  { path: "/browse", component: BrowsePage },
  { path: "/feeds", component: FeedsPage },
  { path: "/topic", component: TopicPage },
];

export function activateDiscoveryFeeds() {
  return { pluginId: "discovery-feeds", deactivate: () => undefined };
}
