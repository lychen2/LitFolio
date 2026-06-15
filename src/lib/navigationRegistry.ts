import {
  Archive,
  Atom,
  Compass,
  FolderKanban,
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

export const NAVIGATION_ITEMS: readonly NavigationRegistryItem[] = [
  { to: "/library", labelKey: "nav.library", icon: LibraryBig, keywords: ["library", "papers", "文献"] },
  { to: "/import", labelKey: "nav.import", icon: Inbox, keywords: ["import", "doi", "pdf", "导入"] },
  { to: "/browse", labelKey: "nav.browse", icon: Atom, keywords: ["browse", "arxiv", "浏览"] },
  { to: "/feeds", labelKey: "nav.feeds", icon: Rss, keywords: ["feeds", "rss", "订阅"] },
  { to: "/candidates", labelKey: "nav.candidates", icon: Archive, keywords: ["candidates", "inbox", "候选"] },
  { to: "/projects", labelKey: "nav.projects", icon: FolderKanban, keywords: ["projects", "research", "项目"] },
  { to: "/topic", labelKey: "nav.topic", icon: Compass, keywords: ["topic", "discover", "主题"] },
  { to: "/ask", labelKey: "nav.ask", icon: MessagesSquare, keywords: ["ask", "qa", "提问"] },
  { to: "/graph", labelKey: "nav.graph", icon: Network, keywords: ["graph", "network", "图谱"] },
  { to: "/settings", labelKey: "nav.settings", icon: Settings, keywords: ["settings", "config", "设置"] },
];
