import { useState, useEffect, useLayoutEffect, useId, useMemo, useRef } from "react";
import type { KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, FileText, Download, Highlighter, BookMarked, type AppIcon } from "@/components/icons";
import { api } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";
import type { TKey } from "@/i18n/dict";
import { visibleNavigation } from "@/lib/navigationRegistry";
import { useEnabledPluginIds } from "@/host/PluginSlot";
import { useDialogKeyboard } from "./useDialogKeyboard";

interface CommandItem {
  id: string;
  label: string;
  category: "navigation" | "papers" | "highlights" | "terms" | "actions";
  icon: AppIcon;
  action: () => void;
  keywords: string[];
  snippet?: string;
}

const categoryLabels: Record<CommandItem["category"], TKey> = {
  navigation: "palette.group.navigation",
  papers: "palette.group.papers",
  highlights: "palette.group.highlights",
  terms: "palette.group.terms",
  actions: "palette.group.actions",
};

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  return open ? <OpenCommandPalette onClose={onClose} /> : null;
}

function OpenCommandPalette({ onClose }: { onClose: () => void }) {
  const dialog = useDialogKeyboard(onClose);
  const t = useT();
  const navigate = useNavigate();
  const { data: enabled } = useEnabledPluginIds();
  const { items: navItems } = useMemo(() => visibleNavigation(enabled), [enabled]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const hintsId = `${listId}-hints`;
  const titleMatch = useMemo(() => {
    const term = query.trim();
    return term ? new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "iu") : null;
  }, [query]);

  const { data: recentPapers } = useQuery({
    queryKey: ["papers", "recent", 10],
    queryFn: () => api.papersRecent(10),
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
    enabled: debouncedQuery.length >= 2,
  });

  const commands = useMemo<CommandItem[]>(() => [
    ...navItems.map((item) => ({
      id: `nav:${item.to.slice(1) || "home"}`,
      label: t(item.labelKey),
      category: "navigation" as const,
      icon: item.icon,
      action: () => navigate(item.to),
      keywords: [...item.keywords],
    })),
    { id: "act:export", label: t("export.title"), category: "actions", icon: Download, action: () => navigate("/settings"), keywords: ["export", "markdown", "导出"] },
  ], [t, navigate, navItems]);

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
    return searchResults.map((r, index) => {
      const category = r.source === "highlight" ? "highlights" : r.source === "term" ? "terms" : "papers";
      const icon = r.source === "highlight" ? Highlighter : r.source === "term" ? BookMarked : FileText;
      return {
        id: `search:${r.source}:${r.paper_id}:${r.snippet.slice(0, 30)}:${index}`,
        label: r.paper_title,
        category,
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
    const map = new Map<CommandItem["category"], CommandItem[]>();
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

  const selectedIdx = Math.max(0, flatList.findIndex((item) => item.id === selectedId));
  const selectedItem = flatList[selectedIdx];
  const activeOptionId = selectedItem ? `${listId}-option-${selectedIdx}` : undefined;

  useLayoutEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  useLayoutEffect(() => {
    if (activeOptionId) {
      document.getElementById(activeOptionId)?.scrollIntoView({ block: "nearest" });
    } else if (listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [activeOptionId, selectedItem?.id]);

  function execute(item: CommandItem) {
    onClose();
    item.action();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.defaultPrevented || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const offset = event.key === "ArrowDown" ? 1 : -1;
      const nextIdx = Math.max(0, Math.min(selectedIdx + offset, flatList.length - 1));
      setSelectedId(flatList[nextIdx]?.id ?? null);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (selectedItem) execute(selectedItem);
    }
  }

  let globalIdx = 0;

  return (
    <div className="litera-modal-backdrop fixed inset-0 z-50 flex items-start justify-center bg-litera-ink/50 pt-[15vh] backdrop-blur-sm" onClick={onClose}>
      <div
        {...dialog}
        aria-label={t("palette.title")}
        onClick={(event) => event.stopPropagation()}
        className="litera-overlay litera-modal-enter w-[580px] max-w-[90vw] overflow-hidden"
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3.5 border-b border-litera-line">
          <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-litera-accent" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-label={t("palette.searchLabel")}
            aria-autocomplete="list"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={activeOptionId}
            aria-describedby={hintsId}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedId(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder={t("palette.placeholder")}
            className="min-w-0 flex-1 bg-transparent text-sm text-litera-text outline-none placeholder:text-litera-mute"
          />
          {query && (
            <button
              type="button"
              className="litera-icon-btn text-lg"
              aria-label={t("palette.clearSearch")}
              title={t("palette.clearSearch")}
              onClick={() => {
                setQuery("");
                setSelectedId(null);
                inputRef.current?.focus();
              }}
            >
              <span aria-hidden="true">×</span>
            </button>
          )}
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[50vh] overflow-auto py-2">
          <div id={listId} role="listbox" aria-label={t("palette.results")}>
            {Array.from(grouped.entries()).map(([category, items]) => {
              const labelId = `${listId}-group-${category}`;
              return (
                <div key={category} role="group" aria-labelledby={labelId} className="mb-2">
                  <div id={labelId} className="litera-section-label px-4 py-1.5">
                    {t(categoryLabels[category])}
                    <span className="ml-2 font-normal tabular-nums">{items.length}</span>
                  </div>
                  {items.map((item) => {
                    const idx = globalIdx++;
                    const Icon = item.icon;
                    const selected = idx === selectedIdx;
                    return (
                      <div
                        key={item.id}
                        id={`${listId}-option-${idx}`}
                        role="option"
                        aria-selected={selected}
                        className={
                          "mx-2 flex cursor-pointer items-center gap-2.5 rounded-lg px-3.5 py-2 text-sm transition-colors " +
                          (selected
                            ? "bg-litera-accent/16 font-medium text-litera-accent ring-1 ring-litera-accent/25"
                            : "text-litera-text hover:bg-litera-surface2")
                        }
                        onClick={() => execute(item)}
                        onMouseMove={() => setSelectedId(item.id)}
                      >
                        <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-litera-mute" />
                        <div className="min-w-0 flex-1">
                          <span className="block truncate">
                            {titleMatch ? item.label.split(titleMatch).map((part, i) => i % 2 ? (
                              <mark key={i} className="rounded-sm bg-litera-accent/20 text-litera-text">{part}</mark>
                            ) : part) : item.label}
                          </span>
                          {item.snippet && (
                            <span className="block truncate text-[11px] text-litera-mute">
                              {renderSnippet(item.snippet)}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
          {flatList.length === 0 && (
            <div role="status" className="px-4 py-6 text-center text-sm text-litera-mute">{t("palette.empty")}</div>
          )}
        </div>

        {/* Footer hint */}
        <div id={hintsId} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-litera-line px-4 py-2 text-[11px] text-litera-mute">
          <span className="inline-flex items-center gap-1.5">
            <kbd className="litera-kbd">↑</kbd><kbd className="litera-kbd">↓</kbd> {t("palette.hint.navigate")}
          </span>
          <span className="inline-flex items-center gap-1.5"><kbd className="litera-kbd">Enter</kbd> {t("common.open")}</span>
          <span className="inline-flex items-center gap-1.5"><kbd className="litera-kbd">Esc</kbd> {t("common.close")}</span>
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
