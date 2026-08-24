import {
  Archive,
  Atom,
  Compass,
  FolderKanban,
  GitCompareArrows,
  Inbox,
  LibraryBig,
  MessagesSquare,
  Network,
  Rss,
  Settings,
  type LucideIcon,
} from "lucide-react";
import type { TKey } from "@/i18n/dict";

export interface NavigationRegistryItem {
  to: string;
  labelKey: TKey;
  icon: LucideIcon;
  keywords: readonly string[];
}

export interface NavigationGroup {
  id: string;
  labelKey: TKey;
  paths: readonly string[];
}

export const NAVIGATION_GROUPS: readonly NavigationGroup[] = [
  { id: "library", labelKey: "nav.group.library", paths: ["/library", "/import", "/candidates"] },
  { id: "discover", labelKey: "nav.group.discover", paths: ["/browse", "/feeds", "/topic"] },
  { id: "research", labelKey: "nav.group.research", paths: ["/projects", "/compare", "/ask", "/graph"] },
  { id: "system", labelKey: "nav.group.system", paths: ["/settings"] },
];

export const NAVIGATION_ITEMS: readonly NavigationRegistryItem[] = [
  { to: "/library", labelKey: "nav.library", icon: LibraryBig, keywords: ["library", "papers", "文献"] },
  { to: "/import", labelKey: "nav.import", icon: Inbox, keywords: ["import", "doi", "pdf", "导入"] },
  { to: "/candidates", labelKey: "nav.candidates", icon: Archive, keywords: ["candidates", "inbox", "候选"] },
  { to: "/browse", labelKey: "nav.browse", icon: Atom, keywords: ["browse", "arxiv", "浏览"] },
  { to: "/feeds", labelKey: "nav.feeds", icon: Rss, keywords: ["feeds", "rss", "订阅"] },
  { to: "/topic", labelKey: "nav.topic", icon: Compass, keywords: ["topic", "discover", "主题"] },
  { to: "/projects", labelKey: "nav.projects", icon: FolderKanban, keywords: ["projects", "research", "项目"] },
  { to: "/compare", labelKey: "nav.compare", icon: GitCompareArrows, keywords: ["compare", "comparison", "比较"] },
  { to: "/ask", labelKey: "nav.ask", icon: MessagesSquare, keywords: ["ask", "qa", "提问"] },
  { to: "/graph", labelKey: "nav.graph", icon: Network, keywords: ["graph", "network", "图谱"] },
  { to: "/settings", labelKey: "nav.settings", icon: Settings, keywords: ["settings", "config", "设置"] },
];
