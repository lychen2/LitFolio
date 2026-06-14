import { useState, useRef, useEffect, type KeyboardEvent, type ChangeEvent, type FocusEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { AtSign, Loader2, Search, Send, X } from "lucide-react";
import { api, type Paper } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";

export interface PinnedPaper {
  id: string;
  title: string;
  year: number | null;
}

interface AskComposerProps {
  onSubmit: (question: string, pinnedIds: string[]) => void;
  isPending: boolean;
  errorMessage: string | null;
  pinnedPapers: PinnedPaper[];
  setPinnedPapers: (next: PinnedPaper[] | ((prev: PinnedPaper[]) => PinnedPaper[])) => void;
  placeholder: string;
}

export function AskComposer({
  onSubmit,
  isPending,
  errorMessage,
  pinnedPapers,
  setPinnedPapers,
  placeholder,
}: AskComposerProps) {
  const t = useT();
  const [question, setQuestion] = useState("");
  const [atQuery, setAtQuery] = useState<string | null>(null);
  const [atStartPos, setAtStartPos] = useState<number | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [pinSearchQuery, setPinSearchQuery] = useState("");
  const [pinSearchFocused, setPinSearchFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const popoverOpen = atQuery !== null;

  const searchResults = useQuery({
    queryKey: ["paperSearchForAtMention", atQuery],
    queryFn: async () => {
      if (atQuery === null) return [];
      if (atQuery === "") return api.papersRecent(8);
      return api.papersSearch(atQuery, 8);
    },
    enabled: popoverOpen,
    staleTime: 5_000,
  });
  const results: Paper[] = searchResults.data ?? [];

  const pinSearchResults = useQuery({
    queryKey: ["paperSearchForPinnedSelector", pinSearchQuery],
    queryFn: async () => {
      const query = pinSearchQuery.trim();
      if (!query) return api.papersRecent(6);
      return api.papersSearch(query, 6);
    },
    enabled: pinSearchFocused,
    staleTime: 5_000,
  });
  const selectorResults: Paper[] = pinSearchResults.data ?? [];

  function updateAtState(text: string, cursor: number) {
    const before = text.slice(0, cursor);
    const lastAt = before.lastIndexOf("@");
    if (lastAt === -1) {
      setAtQuery(null);
      setAtStartPos(null);
      return;
    }
    const prevChar = lastAt > 0 ? before[lastAt - 1] : "";
    if (prevChar && !/[\s\n]/.test(prevChar)) {
      setAtQuery(null);
      setAtStartPos(null);
      return;
    }
    const query = before.slice(lastAt + 1);
    if (/[\s\n]/.test(query) || query.length > 64) {
      setAtQuery(null);
      setAtStartPos(null);
      return;
    }
    setAtQuery(query);
    setAtStartPos(lastAt);
    setFocusedIndex(0);
  }

  function handleChange(e: ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    setQuestion(next);
    updateAtState(next, e.target.selectionStart);
  }

  function addPinnedPaper(paper: Paper) {
    if (pinnedPapers.some((p) => p.id === paper.id)) return;
    setPinnedPapers((prev) => [
      ...prev,
      { id: paper.id, title: paper.title, year: paper.year },
    ]);
  }

  function pickMentionPaper(paper: Paper) {
    addPinnedPaper(paper);
    if (atStartPos !== null && textareaRef.current) {
      const cursor = textareaRef.current.selectionStart;
      const before = question.slice(0, atStartPos);
      const after = question.slice(cursor);
      const restoredCursor = atStartPos;
      setQuestion(before + after);
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.selectionStart = restoredCursor;
        el.selectionEnd = restoredCursor;
      });
    }
    setAtQuery(null);
    setAtStartPos(null);
  }

  function pickSelectorPaper(paper: Paper) {
    addPinnedPaper(paper);
    setPinSearchQuery("");
    setPinSearchFocused(false);
  }

  function removePin(id: string) {
    setPinnedPapers((prev) => prev.filter((p) => p.id !== id));
  }

  function submit() {
    const trimmed = question.trim();
    if (!trimmed || isPending) return;
    onSubmit(
      trimmed,
      pinnedPapers.map((p) => p.id),
    );
    setQuestion("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (popoverOpen && results.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((i) => Math.min(i + 1, results.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        const paper = results[focusedIndex];
        if (paper) pickMentionPaper(paper);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setAtQuery(null);
        setAtStartPos(null);
        return;
      }
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  }

  function handlePinSearchBlur(event: FocusEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setPinSearchFocused(false);
  }

  useEffect(() => {
    if (!popoverOpen) return;
    function handler(e: MouseEvent) {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (textareaRef.current?.contains(target)) return;
      setAtQuery(null);
      setAtStartPos(null);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [popoverOpen]);

  return (
    <div className="relative">
      {pinnedPapers.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-litera-mute">{t("ask.pinnedHeader")}</span>
          {pinnedPapers.map((p) => (
            <span
              key={p.id}
              className="inline-flex max-w-[280px] items-center gap-1 rounded-md bg-litera-accent/15 px-2 py-0.5 text-litera-accent"
            >
              <span className="truncate">
                {p.title}
                {p.year ? ` (${p.year})` : ""}
              </span>
              <button
                onClick={() => removePin(p.id)}
                className="shrink-0 hover:text-red-400"
                aria-label={t("ask.pinRemove")}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div
        className="mb-3 rounded-lg border border-litera-line bg-litera-panel/60 p-2"
        onBlur={handlePinSearchBlur}
      >
        <label className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-litera-mute">
          <Search className="h-3 w-3" />
          {t("ask.pinSelectorLabel")}
        </label>
        <input
          value={pinSearchQuery}
          onChange={(event) => setPinSearchQuery(event.target.value)}
          onFocus={() => setPinSearchFocused(true)}
          placeholder={t("ask.pinSelectorPlaceholder")}
          className="w-full bg-transparent text-sm text-litera-text outline-none placeholder:text-litera-mute"
        />
        {pinSearchFocused && (
          <div className="mt-2 max-h-48 overflow-auto rounded-md border border-litera-line bg-litera-bg/95">
            {pinSearchResults.isLoading ? (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-litera-mute">
                <Loader2 className="h-3 w-3 animate-spin" />
                {t("ask.searching")}
              </div>
            ) : selectorResults.length === 0 ? (
              <div className="px-3 py-2 text-xs text-litera-mute">{t("ask.pinSelectorEmpty")}</div>
            ) : (
              <ul>
                {selectorResults.map((paper) => (
                  <li key={paper.id}>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => pickSelectorPaper(paper)}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-litera-panel/80"
                    >
                      <div className="truncate font-medium text-litera-text">{paper.title}</div>
                      <div className="truncate text-[11px] text-litera-mute">
                        {formatPaperMeta(paper)}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <textarea
          ref={textareaRef}
          value={question}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 min-h-[60px] max-h-[120px] resize-none litera-panel p-3 text-sm leading-relaxed text-litera-text outline-none placeholder:text-litera-mute"
          rows={2}
        />
        <button
          onClick={submit}
          disabled={isPending || !question.trim()}
          className="self-end litera-btn-primary px-4 py-3 disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </div>
      <div className="mt-2 text-[11px] text-litera-mute">
        {t("ask.inputHint")} · {t("ask.atMentionHint")}
      </div>
      {errorMessage && (
        <div className="mt-2 break-all text-sm text-red-400/90">✕ {errorMessage}</div>
      )}
      {popoverOpen && (
        <div
          ref={popoverRef}
          className="absolute bottom-full left-0 right-16 z-10 mb-2 max-h-64 overflow-auto shadow-lg litera-panel"
        >
          {searchResults.isLoading ? (
            <div className="flex items-center gap-2 p-3 text-xs text-litera-mute">
              <Loader2 className="h-3 w-3 animate-spin" />
              {t("ask.searching")}
            </div>
          ) : results.length === 0 ? (
            <div className="flex items-center gap-2 p-3 text-xs text-litera-mute">
              <AtSign className="h-3 w-3" />
              {t("ask.atMentionEmpty")}
            </div>
          ) : (
            <ul>
              {results.map((paper, idx) => (
                <li key={paper.id}>
                  <button
                    onMouseEnter={() => setFocusedIndex(idx)}
                    onClick={() => pickMentionPaper(paper)}
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-litera-panel/80 ${
                      idx === focusedIndex ? "bg-litera-panel/80" : ""
                    }`}
                  >
                    <div className="truncate font-medium text-litera-text">{paper.title}</div>
                    <div className="truncate text-[11px] text-litera-mute">
                      {formatPaperMeta(paper)}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function formatPaperMeta(paper: Paper): string {
  const authors = paper.authors.slice(0, 2).join(", ");
  const authorLabel = paper.authors.length > 2 ? `${authors} et al.` : authors;
  return [authorLabel, paper.year ?? null].filter(Boolean).join(" · ");
}
