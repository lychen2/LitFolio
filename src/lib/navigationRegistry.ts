import {
  Archive,
  Atom,
  Compass,
  Inbox,
  LibraryBig,
  Network,
  Rss,
  Settings,
  type AppIcon,
} from "@/components/icons";
import type { TKey } from "@/i18n/dict";
import { isPluginBuilt } from "@/host/registry";

export interface NavigationRegistryItem {
  to: string;
  labelKey: TKey;
  icon: AppIcon;
  keywords: readonly string[];
  pluginId?: string;
}

export interface NavigationGroup {
  id: string;
  labelKey: TKey;
  paths: readonly string[];
}

const ALL_NAVIGATION_GROUPS: readonly NavigationGroup[] = [
  { id: "library", labelKey: "nav.group.library", paths: ["/library", "/import", "/candidates"] },
  { id: "discover", labelKey: "nav.group.discover", paths: ["/browse", "/feeds", "/topic", "/literature-network"] },
  { id: "system", labelKey: "nav.group.system", paths: ["/settings"] },
];

const ALL_NAVIGATION_ITEMS: readonly NavigationRegistryItem[] = [
  { to: "/library", labelKey: "nav.library", icon: LibraryBig, keywords: ["library", "papers", "文献"] },
  { to: "/import", labelKey: "nav.import", icon: Inbox, keywords: ["import", "doi", "pdf", "导入"] },
  { to: "/candidates", labelKey: "nav.candidates", icon: Archive, keywords: ["candidates", "inbox", "候选"], pluginId: "candidate-inbox" },
  { to: "/browse", labelKey: "nav.browse", icon: Atom, keywords: ["browse", "arxiv", "浏览"], pluginId: "discovery-feeds" },
  { to: "/feeds", labelKey: "nav.feeds", icon: Rss, keywords: ["feeds", "rss", "订阅"], pluginId: "discovery-feeds" },
  { to: "/topic", labelKey: "nav.topic", icon: Compass, keywords: ["topic", "discover", "主题"], pluginId: "discovery-feeds" },
  { to: "/literature-network", labelKey: "nav.literatureNetwork", icon: Network, keywords: ["related papers", "citation network", "相关文献", "引用网络"], pluginId: "literature-network" },
  { to: "/settings", labelKey: "nav.settings", icon: Settings, keywords: ["settings", "config", "设置"] },
];

export const NAVIGATION_ITEMS: readonly NavigationRegistryItem[] = ALL_NAVIGATION_ITEMS.filter(
  (item) => !item.pluginId || isPluginBuilt(item.pluginId),
);

const visiblePaths = new Set(NAVIGATION_ITEMS.map((item) => item.to));
export const NAVIGATION_GROUPS: readonly NavigationGroup[] = ALL_NAVIGATION_GROUPS
  .map((group) => ({ ...group, paths: group.paths.filter((path) => visiblePaths.has(path)) }))
  .filter((group) => group.paths.length > 0);

/** Built-in routes plus currently enabled plugins. Unknown/loading host state hides plugin entries. */
export function visibleNavigation(enabledIds: ReadonlySet<string> | undefined): {
  items: NavigationRegistryItem[];
  groups: NavigationGroup[];
} {
  const enabled = enabledIds ?? new Set<string>();
  const items = NAVIGATION_ITEMS.filter((item) => !item.pluginId || enabled.has(item.pluginId));
  const paths = new Set(items.map((item) => item.to));
  const groups = NAVIGATION_GROUPS
    .map((group) => ({ ...group, paths: group.paths.filter((path) => paths.has(path)) }))
    .filter((group) => group.paths.length > 0);
  return { items, groups };
}
