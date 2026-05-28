import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Search, LibraryBig, Inbox, Compass, Settings, MessagesSquare,
  Network, Rss, Atom, FileText, Download, Highlighter, BookMarked,
} from "lucide-react";
import { api } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";

interface CommandItem {
  id: string;
  label: string;
  category: "navigation" | "papers" | "highlights" | "terms" | "actions";
  icon: typeof Search;
  action: () => void;
  keywords: string[];
  snippet?: string;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { data: recentPapers } = useQuery({
    queryKey: ["papers", "recent", 10],
    queryFn: () => api.papersRecent(10),
    enabled: open,
  });

  // Unified search when user types a query.
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    if (!query.trim()) { setDebouncedQuery(""); return; }
    const timer = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(timer);
  }, [query]);

  const { data: searchResults } = useQuery({
    queryKey: ["unifiedSearch", debouncedQuery],
    queryFn: () => api.searchUnified(debouncedQuery, 20),
    enabled: open && debouncedQuery.length >= 2,
  });

  // Static commands.
  const commands = useMemo<CommandItem[]>(() => [
    // Navigation
    { id: "nav:library", label: t("nav.library"), category: "navigation", icon: LibraryBig, action: () => navigate("/library"), keywords: ["library", "文献"] },
    { id: "nav:import", label: t("nav.import"), category: "navigation", icon: Inbox, action: () => navigate("/import"), keywords: ["import", "导入"] },
    { id: "nav:browse", label: t("nav.browse"), category: "navigation", icon: Atom, action: () => navigate("/browse"), keywords: ["browse", "arxiv", "浏览"] },
    { id: "nav:feeds", label: t("nav.feeds"), category: "navigation", icon: Rss, action: () => navigate("/feeds"), keywords: ["feeds", "rss", "订阅"] },
    { id: "nav:topic", label: t("nav.topic"), category: "navigation", icon: Compass, action: () => navigate("/topic"), keywords: ["topic", "discover", "主题"] },
    { id: "nav:ask", label: t("nav.ask"), category: "navigation", icon: MessagesSquare, action: () => navigate("/ask"), keywords: ["ask", "提问"] },
    { id: "nav:graph", label: t("nav.graph"), category: "navigation", icon: Network, action: () => navigate("/graph"), keywords: ["graph", "图谱"] },
    { id: "nav:settings", label: t("nav.settings"), category: "navigation", icon: Settings, action: () => navigate("/settings"), keywords: ["settings", "设置"] },
    // Actions
    { id: "act:export", label: t("export.title"), category: "actions", icon: Download, action: () => navigate("/settings"), keywords: ["export", "markdown", "导出"] },
  ], [t, navigate]);

  // Paper items from recent papers.
  const paperItems = useMemo<CommandItem[]>(() => {
    if (!recentPapers) return [];
    return recentPapers.map((p) => ({
      id: `paper:${p.id}`,
      label: p.title,
      category: "papers" as const,
      icon: FileText,
      action: () => navigate(`/reader/${p.id}`),
      keywords: [p.title.toLowerCase(), ...p.authors.map((a) => a.toLowerCase())],
    }));
  }, [recentPapers, navigate]);

  // Items from unified search results.
  const searchItems = useMemo<CommandItem[]>(() => {
    if (!searchResults || searchResults.length === 0) return [];
    return searchResults.map((r) => {
      const cat = r.source === "highlight" ? "highlights" : r.source === "term" ? "terms" : "papers";
      const icon = r.source === "highlight" ? Highlighter : r.source === "term" ? BookMarked : FileText;
      return {
        id: `search:${r.source}:${r.paper_id}:${r.snippet.slice(0, 30)}`,
        label: r.paper_title,
        category: cat as CommandItem["category"],
        icon,
        action: () => navigate(`/reader/${r.paper_id}`),
        keywords: [r.paper_title.toLowerCase()],
        snippet: r.snippet,
      };
    });
  }, [searchResults, navigate]);

  // When searching, show search results + matching commands; otherwise show all.
  const allItems = useMemo(() => {
    if (debouncedQuery && searchItems.length > 0) {
      const q = debouncedQuery.toLowerCase();
      const matchingCommands = commands.filter((c) =>
        [c.label.toLowerCase(), ...c.keywords].some((k) => k.includes(q))
      );
      return [...matchingCommands, ...searchItems];
    }
    return [...commands, ...paperItems];
  }, [debouncedQuery, searchItems, commands, paperItems]);

  // Fuzzy filter.
  const filtered = useMemo(() => {
    if (!query.trim()) return allItems;
    const q = query.toLowerCase();
    return allItems.filter((item) => {
      const haystack = [item.label.toLowerCase(), ...item.keywords].join(" ");
      return fuzzyMatch(q, haystack);
    });
  }, [query, allItems]);

  // Group by category.
  const grouped = useMemo(() => {
    const map = new Map<string, CommandItem[]>();
    for (const item of filtered) {
      const group = map.get(item.category) ?? [];
      group.push(item);
      map.set(item.category, group);
    }
    return map;
  }, [filtered]);

  const flatList = useMemo(() => {
    const result: CommandItem[] = [];
    for (const items of grouped.values()) {
      result.push(...items);
    }
    return result;
  }, [grouped]);

  // Reset on open.
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Clamp selected index.
  useEffect(() => {
    if (selectedIdx >= flatList.length) {
      setSelectedIdx(Math.max(0, flatList.length - 1));
    }
  }, [flatList.length, selectedIdx]);

  // Scroll selected into view.
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${selectedIdx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  const execute = useCallback((item: CommandItem) => {
    onClose();
    item.action();
  }, [onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, flatList.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = flatList[selectedIdx];
      if (item) execute(item);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }, [flatList, selectedIdx, execute, onClose]);

  if (!open) return null;

  const categoryLabels: Record<string, string> = {
    navigation: "Navigation",
    papers: "Papers",
    highlights: "Highlights",
    terms: "Terms",
    actions: "Actions",
  };

  let globalIdx = 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-litera-ink/50 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[560px] max-w-[90vw] bg-litera-paper border border-litera-line rounded-xl shadow-2xl overflow-hidden"
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-litera-line">
          <Search className="h-4 w-4 text-litera-mute shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIdx(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Search papers, navigate, or run commands…"
            className="flex-1 bg-transparent text-sm text-litera-text outline-none placeholder:text-litera-mute"
          />
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[50vh] overflow-auto py-2">
          {flatList.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-litera-mute">No results</div>
          )}
          {Array.from(grouped.entries()).map(([category, items]) => (
            <div key={category}>
              <div className="px-4 py-1.5 text-[11px] uppercase tracking-wider text-litera-mute">
                {categoryLabels[category] ?? category}
              </div>
              {items.map((item) => {
                const idx = globalIdx++;
                const Icon = item.icon;
                return (
                  <div
                    key={item.id}
                    data-idx={idx}
                    className={
                      "flex items-center gap-2.5 px-4 py-2 text-sm cursor-pointer transition-colors " +
                      (idx === selectedIdx
                        ? "bg-litera-accent/10 text-litera-accent"
                        : "text-litera-text hover:bg-litera-panel")
                    }
                    onClick={() => execute(item)}
                    onMouseEnter={() => setSelectedIdx(idx)}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <span className="truncate block">{item.label}</span>
                      {item.snippet && (
                        <span className="text-[11px] text-litera-mute truncate block">
                          {renderSnippet(item.snippet)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-litera-line flex items-center gap-4 text-[11px] text-litera-mute">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}

/** Simple fuzzy match: all query chars must appear in order. */
function fuzzyMatch(query: string, text: string): boolean {
  let qi = 0;
  for (let ti = 0; ti < text.length && qi < query.length; ti++) {
    if (text[ti] === query[qi]) qi++;
  }
  return qi === query.length;
}

/**
 * Backend snippet wraps matched terms with `>>>...<<<`. Split into plain text
 * and `<mark>` nodes — never feed the snippet through `dangerouslySetInnerHTML`,
 * because the unmarked spans come straight from paper abstracts / RSS bodies
 * and can contain raw `<script>`-shaped strings.
 */
function renderSnippet(snippet: string): React.ReactNode[] {
  const parts = snippet.split(/(>>>.*?<<<)/g);
  return parts.map((part, i) => {
    const match = part.match(/^>>>(.*?)<<<$/);
    if (match) {
      return (
        <mark key={i} className="bg-litera-accent/20 text-litera-text rounded px-0.5">
          {match[1]}
        </mark>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
