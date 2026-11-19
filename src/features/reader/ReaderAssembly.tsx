import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { AlertTriangle, BookMarked, FileText, Highlighter, Languages, NotebookPen, Orbit, Search, X } from "lucide-react";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import { libraryClient, type Paper } from "@/core/data";
import { useT } from "@/i18n/I18nProvider";
import { useNarrowLayout } from "@/hooks/useNarrowLayout";
import { cn } from "@/lib/cn";
import type { TKey } from "@/i18n/dict";
import { HighlightList } from "@/pages/reader/HighlightList";
import { LegacyTranslationPane, useLegacyTranslation, type LegacyTranslationState } from "@/pages/reader/LegacyTranslationPane";
import { PdfPane } from "@/pages/reader/PdfPane";
import { NoteSectionsPane } from "@/pages/reader/NoteSectionsPane";
import { SelectionTranslatePane } from "@/pages/reader/SelectionTranslatePane";
import { TermsPane } from "@/pages/reader/TermsPane";
import { ReaderOnboarding } from "@/pages/reader/ReaderOnboarding";
import { MessageScreen } from "@/pages/reader/ReaderMessageScreen";
import { HelpPanel } from "@/pages/reader/HelpPanel";
import { api, type Highlight } from "@/lib/api";
import { READER_SHORTCUTS, type ReaderShortcut, type ReadingHostAction } from "@/lib/apiReadingService";
import { isReaderMarginNote } from "@/pages/reader/pdfSelectionHelpers";
import { useLibraryHostActions } from "@/pages/library/LibraryHostActions";
import { CoreFrame } from "./CoreFrame";

const HOST_SHORTCUTS: ReadonlySet<string> = new Set(READER_SHORTCUTS);
const visibleHighlights = (highlights: Highlight[]) => highlights.filter((item) => !isReaderMarginNote(item));

/**
 * Reader route. The main column is the upstream LitFolio reader page, which
 * owns reading, layout, translation, its own annotations and figure handling.
 * LitFolio's tools (reading card, highlight list, terms, selection
 * translation, PDF region notes, earlier full-text translations) sit in one
 * panel beside it.
 *
 * `?split=<paperId>` keeps two papers side by side, each with its own tools.
 */
export function ReaderAssembly() {
  const t = useT();
  const { paperId } = useParams<{ paperId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const splitId = searchParams.get("split");

  const openSplit = useCallback((id: string) => {
    setSearchParams({ split: id }, { replace: true });
  }, [setSearchParams]);

  const closeSplit = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete("split");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  if (!paperId) {
    return <MessageScreen icon={<AlertTriangle className="h-6 w-6 text-litera-warn" />} title={t("reader.noId")} backLink="/library" />;
  }

  if (splitId) {
    return (
      <section className="h-full flex flex-col">
        <header className="reader-toolbar">
          <div className="min-w-0 flex-1 truncate text-xs font-medium text-litera-mute">{t("reader.splitView")}</div>
          <button onClick={closeSplit} className="litera-btn text-xs" title={t("reader.closeSplit")}>
            <X className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{t("reader.closeSplit")}</span>
          </button>
        </header>
        <div className="flex-1 min-h-0">
          <PanelGroup direction="horizontal">
            <Panel defaultSize={50} minSize={30}>
              <ReaderPane paperId={paperId} compact />
            </Panel>
            <PanelResizeHandle className="reader-resize-handle">
              <div className="reader-resize-grip" />
            </PanelResizeHandle>
            <Panel defaultSize={50} minSize={30}>
              <ReaderPane paperId={splitId} compact onOpenSplit={openSplit} />
            </Panel>
          </PanelGroup>
        </div>
      </section>
    );
  }

  return <ReaderPane paperId={paperId} onOpenSplit={openSplit} />;
}

type ExtrasTab = "notes" | "highlights" | "terms" | "translate" | "cached" | "pdf";

/** One paper: reading frame plus its tools panel. */
function ReaderPane({
  paperId,
  compact,
  onOpenSplit,
}: {
  paperId: string;
  compact?: boolean;
  onOpenSplit?: (id: string) => void;
}) {
  const t = useT();
  const isNarrow = useNarrowLayout(1200);
  const effectiveCompact = compact || isNarrow;
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [tab, setTab] = useState<ExtrasTab>("notes");
  const [selectionText, setSelectionText] = useState("");
  const [pdfPage, setPdfPage] = useState<number | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [splitPickerOpen, setSplitPickerOpen] = useState(false);
  const pane = useRef<HTMLDivElement>(null);
  /// The PDF tool is the one heavy panel, so it mounts on first use and stays
  /// mounted afterwards to keep scroll position and viewer state.
  const [pdfMounted, setPdfMounted] = useState(false);
  const scrollFn = useRef<((id: string) => void) | null>(null);
  const pendingJumpId = useRef<string | null>(null);
  const currentHighlightIdx = useRef(-1);

  const paperQ = useQuery({
    queryKey: ["paper", paperId],
    queryFn: () => libraryClient.paperGet(paperId),
  });
  const highlightsQ = useQuery({
    queryKey: ["highlights", paperId],
    queryFn: () => api.highlightList(paperId),
    select: visibleHighlights,
    enabled: Boolean(paperQ.data),
  });

  useEffect(() => {
    if (isNarrow) setExtrasOpen(false);
  }, [isNarrow]);

  useEffect(() => {
    if (tab === "pdf") setPdfMounted(true);
  }, [tab]);

  const openExtras = useCallback((next: ExtrasTab) => {
    setTab(next);
    setExtrasOpen(true);
  }, []);

  const handleScrollRef = useCallback((fn: ((id: string) => void) | null) => {
    scrollFn.current = fn;
    if (fn && pendingJumpId.current) {
      fn(pendingJumpId.current);
      pendingJumpId.current = null;
    }
  }, []);

  const handleJump = useCallback((highlight: Highlight) => {
    setPdfPage(highlight.page);
    openExtras("pdf");
    if (scrollFn.current) scrollFn.current(highlight.id);
    else pendingJumpId.current = highlight.id;
  }, [openExtras]);

  const handleTranslateSelection = useCallback((text: string) => {
    setSelectionText(text);
    openExtras("translate");
  }, [openExtras]);

  const handleOpenPdfPage = useCallback((page: number) => {
    setPdfPage(page);
    openExtras("pdf");
  }, [openExtras]);
  const host = useLibraryHostActions({
    onOpenReader: (id) => {
      if (id !== paperId) onOpenSplit?.(id);
    },
  });
  /**
   * The reader's own panels are this page's extras tabs, so those actions open
   * the tab instead of a host drawer; everything else uses the library
   * controller, which keeps one workflow for one capability across both hosts.
   */
  const { onAction } = host;
  const hostAction = useCallback(
    (message: ReadingHostAction) => {
      switch (message.action) {
        case "selection-translate":
          if (message.text) handleTranslateSelection(message.text);
          return;
        case "notes":
        case "highlights":
        case "terms":
        case "cached":
        case "pdf":
          openExtras(message.action);
          return;
        default:
          onAction(message);
      }
    },
    [onAction, handleTranslateSelection, openExtras],
  );

  const legacy = useLegacyTranslation(paperId);

  const handleShortcut = useCallback((key: ReaderShortcut) => {
    if (key === "?") {
      setShowHelp((prev) => !prev);
      return;
    }
    if (key === "1" || key === "2" || key === "3") {
      openExtras(key === "1" ? "notes" : key === "2" ? "translate" : "terms");
      return;
    }
    const highlights = highlightsQ.data;
    if (!highlights?.length) return;
    const step = key === "j" || key === "]" ? 1 : -1;
    currentHighlightIdx.current = Math.max(0, Math.min(currentHighlightIdx.current + step, highlights.length - 1));
    handleJump(highlights[currentHighlightIdx.current]);
  }, [handleJump, highlightsQ.data, openExtras]);

  const handleReaderControl = useCallback((control: "extras" | "split") => {
    if (control === "extras") setExtrasOpen((open) => !open);
    else if (onOpenSplit) setSplitPickerOpen(true);
  }, [onOpenSplit]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target;
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229 ||
          event.altKey || event.ctrlKey || event.metaKey || !(target instanceof Element) ||
          !pane.current?.contains(target) ||
          target.closest("button, a, input, textarea, select, [contenteditable], [role='dialog']")) return;
      const key = event.key.toLowerCase();
      if (!HOST_SHORTCUTS.has(key)) return;
      event.preventDefault();
      handleShortcut(key as ReaderShortcut);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleShortcut]);

  if (paperQ.isLoading) {
    return <MessageScreen title={t("common.loading")} backLink="/library" />;
  }
  if (!paperQ.data) {
    return <MessageScreen icon={<AlertTriangle className="h-6 w-6 text-litera-warn" />} title={t("reader.notFound")} backLink="/library" />;
  }

  return (
    <div ref={pane} className="relative h-full flex flex-col">
      {!compact && <ReaderOnboarding />}
      {compact && (
        <h2 className="shrink-0 truncate border-b border-litera-line px-3 py-1.5 text-xs font-medium" title={paperQ.data.title}>
          {paperQ.data.title}
        </h2>
      )}
      <div className="flex-1 min-h-0">
        <PanelGroup direction="horizontal" autoSaveId={effectiveCompact ? undefined : "litera-reader-layout"}>
          <Panel id="reader-document" order={1} defaultSize={extrasOpen ? 66 : 100} minSize={35}>
            <CoreFrame
              paperId={paperId}
              onAction={hostAction}
              onShortcut={handleShortcut}
              onReaderControl={handleReaderControl}
              extrasOpen={extrasOpen}
              canSplit={Boolean(onOpenSplit)}
              splitView={compact}
              hasHighlights={Boolean(highlightsQ.data?.length)}
            />
          </Panel>
          {extrasOpen && (
            <>
              <PanelResizeHandle className="reader-resize-handle">
                <div className="reader-resize-grip" />
              </PanelResizeHandle>
              <Panel
                id="reader-extras"
                order={2}
                defaultSize={effectiveCompact ? 45 : 34}
                minSize={22}
                maxSize={62}
                onCollapse={() => setExtrasOpen(false)}
              >
                <ExtrasPane
                  paperId={paperId}
                  tab={tab}
                  onTabChange={setTab}
                  selectionText={selectionText}
                  pdfMounted={pdfMounted}
                  pdfPage={pdfPage}
                  onScrollRef={handleScrollRef}
                  onJump={handleJump}
                  onOpenPdfPage={handleOpenPdfPage}
                  legacy={legacy}
                  highlights={highlightsQ}
                  onTranslateSelection={handleTranslateSelection}
                />
              </Panel>
            </>
          )}
        </PanelGroup>
      </div>
      {splitPickerOpen && onOpenSplit && (
        <SplitPaperPicker paperId={paperId} onOpenSplit={onOpenSplit} onClose={() => setSplitPickerOpen(false)} />
      )}
      {showHelp && <HelpPanel onClose={() => setShowHelp(false)} />}
      {host.ui}
    </div>
  );
}

const EXTRAS_TABS: Array<{ id: ExtrasTab; icon: ReactNode; labelKey: TKey }> = [
  { id: "notes", icon: <NotebookPen className="h-3.5 w-3.5" />, labelKey: "reader.tabNotes" },
  { id: "highlights", icon: <Highlighter className="h-3.5 w-3.5" />, labelKey: "reader.highlights" },
  { id: "terms", icon: <Orbit className="h-3.5 w-3.5" />, labelKey: "reader.tabTerms" },
  { id: "translate", icon: <Languages className="h-3.5 w-3.5" />, labelKey: "reader.tabTranslate" },
  { id: "cached", icon: <BookMarked className="h-3.5 w-3.5" />, labelKey: "reader.legacyTab" },
  { id: "pdf", icon: <FileText className="h-3.5 w-3.5" />, labelKey: "reader.pdfTab" },
];
function ExtrasPane({
  paperId,
  tab,
  onTabChange,
  selectionText,
  pdfMounted,
  pdfPage,
  onScrollRef,
  onJump,
  onOpenPdfPage,
  legacy,
  highlights,
  onTranslateSelection,
}: {
  paperId: string;
  tab: ExtrasTab;
  onTabChange: (tab: ExtrasTab) => void;
  selectionText: string;
  pdfMounted: boolean;
  pdfPage: number | null;
  onScrollRef: (fn: ((id: string) => void) | null) => void;
  onJump: (highlight: Highlight) => void;
  onOpenPdfPage: (page: number) => void;
  legacy: LegacyTranslationState;
  highlights: UseQueryResult<Highlight[]>;
  onTranslateSelection: (text: string) => void;
}) {
  const t = useT();
  const tabs = useMemo(
    () => EXTRAS_TABS.filter((entry) => entry.id !== "cached" || Boolean(legacy.translation)),
    [legacy.translation],
  );
  return (
    <div id="reader-extras" className="reader-workspace h-full flex flex-col bg-litera-paper/30">
      <div className="reader-panel-header">
        <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label={t("reader.extrasTitle")}>
          {tabs.map((entry) => (
            <button
              key={entry.id}
              role="tab"
              aria-selected={tab === entry.id}
              onClick={() => onTabChange(entry.id)}
              title={t(entry.labelKey)}
              aria-label={t(entry.labelKey)}
              className={cn(
                "inline-flex min-h-7 items-center gap-1 rounded-[var(--litera-radius)] border px-1.5 py-1 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-litera-focus",
                tab === entry.id
                  ? "border-litera-accent/60 bg-litera-accent/12 text-litera-accent"
                  : "border-transparent text-litera-mute hover:bg-litera-surface2 hover:text-litera-text",
              )}
            >
              {entry.icon}
              <span>{t(entry.labelKey)}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 min-h-0 relative">
        <div className={cn("h-full", tab !== "notes" && "hidden")}>
          <NoteSectionsPane paperId={paperId} />
        </div>
        <div className={cn("h-full absolute inset-0", tab !== "highlights" && "hidden")}>
          <HighlightList paperId={paperId} onJump={onJump} list={highlights} />
        </div>
        <div className={cn("h-full absolute inset-0", tab !== "terms" && "hidden")}>
          <TermsPane paperId={paperId} />
        </div>
        <div className={cn("h-full absolute inset-0", tab !== "translate" && "hidden")}>
          <SelectionTranslatePane paperId={paperId} selectionText={selectionText} />
        </div>
        {legacy.translation && (
          <div className={cn("h-full absolute inset-0", tab !== "cached" && "hidden")}>
            <LegacyTranslationPane
              paperId={paperId}
              translation={legacy.translation}
              error={legacy.error}
              isLoading={legacy.isLoading}
              onOpenPdfPage={onOpenPdfPage}
            />
          </div>
        )}
        {pdfMounted && (
          <div className={cn("h-full absolute inset-0", tab !== "pdf" && "hidden")}>
            <PdfPane
              paperId={paperId}
              pageToOpen={pdfPage}
              scrollRefCb={onScrollRef}
              onTranslateSelection={onTranslateSelection}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function SplitPaperPicker({
  paperId,
  onOpenSplit,
  onClose,
}: {
  paperId: string;
  onOpenSplit: (id: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const papersQ = useQuery({
    queryKey: ["readerSplitPaperSearch", query],
    queryFn: async () => {
      const trimmed = query.trim();
      return trimmed ? libraryClient.papersSearch(trimmed, 8) : libraryClient.papersRecent(8);
    },
    staleTime: 5_000,
  });

  const papers: Paper[] = (papersQ.data ?? []).filter((paper) => paper.id !== paperId);
  const focusedPaper = papers[focusedIndex];

  useEffect(() => {
    setFocusedIndex(0);
  }, [query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setFocusedIndex((index) => Math.min(index + 1, Math.max(papers.length - 1, 0)));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setFocusedIndex((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === "Enter" && focusedPaper) {
      event.preventDefault();
      onOpenSplit(focusedPaper.id);
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-litera-ink/40" onClick={onClose}>
        <div role="dialog" aria-modal="true" aria-label={t("reader.splitPickerTitle")} onClick={(event) => event.stopPropagation()}
          className="w-[360px] max-w-[calc(100vw-2rem)] litera-panel shadow-xl">
          <div className="border-b border-litera-line px-3 py-2">
            <div className="mb-1 text-[11px] font-medium uppercase tracking-normal text-litera-mute">
              {t("reader.splitPickerTitle")}
            </div>
            <label className="flex items-center gap-2 rounded-md border border-litera-line bg-litera-bg/70 px-2 py-1.5">
              <Search className="h-3.5 w-3.5 text-litera-mute" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t("reader.splitSearchPlaceholder")}
                className="min-w-0 flex-1 bg-transparent text-sm text-litera-text outline-none placeholder:text-litera-mute"
              />
            </label>
          </div>
          {papersQ.isLoading ? (
            <div className="px-3 py-3 text-xs text-litera-mute">{t("reader.splitSearching")}</div>
          ) : papersQ.isError ? (
            <div className="px-3 py-3 text-xs text-litera-error">{t("reader.splitSearchFailed")}</div>
          ) : papers.length === 0 ? (
            <div className="px-3 py-3 text-xs text-litera-mute">
              {t(query.trim() ? "reader.splitNoResults" : "reader.splitNoOtherPapers")}
            </div>
          ) : (
            <ul className="max-h-72 overflow-auto py-1">
              {papers.map((paper, index) => (
                <li key={paper.id}>
                  <button
                    onMouseEnter={() => setFocusedIndex(index)}
                    onClick={() => { onOpenSplit(paper.id); onClose(); }}
                    className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-litera-panel/80 ${
                      index === focusedIndex ? "bg-litera-panel/80" : ""
                    }`}
                  >
                    <div className="truncate font-medium text-litera-text">{paper.title}</div>
                    <div className="mt-0.5 truncate text-[11px] text-litera-mute">
                      {paper.authors.slice(0, 2).join(", ")}
                      {paper.authors.length > 2 ? " et al." : ""}
                      {paper.year ? ` · ${paper.year}` : ""}
                      {paper.venue ? ` · ${paper.venue}` : ""}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
    </div>
  );
}
