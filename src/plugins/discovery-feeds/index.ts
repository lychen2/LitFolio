import { BrowsePage } from "@/pages/BrowsePage";
import { FeedsPage } from "@/pages/FeedsPage";
import { TopicPage } from "@/pages/TopicPage";
import type { FrontendPluginEntry } from "@/host/pluginTypes";

export const pluginRoutes: FrontendPluginEntry["pluginRoutes"] = [
  { path: "/browse", component: BrowsePage },
  { path: "/feeds", component: FeedsPage },
  { path: "/topic", component: TopicPage },
];

export function activateDiscoveryFeeds() {
  return { pluginId: "discovery-feeds", deactivate: () => undefined };
}
