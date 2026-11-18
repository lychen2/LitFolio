import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, BookMarked, Columns2, FileText, Highlighter, Languages, NotebookPen, Orbit, PanelRightClose, PanelRightOpen, Search, X } from "lucide-react";
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
import type { Highlight } from "@/lib/api";
import type { ReadingHostAction } from "@/lib/apiReadingService";
import { useLibraryHostActions } from "@/pages/library/LibraryHostActions";
import { EasyReadFrame } from "./EasyReadFrame";

/**
 * Reader route. The main column is the upstream EasyRead reader page, which
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
          <Link to="/library" className="litera-btn text-xs" title={t("reader.backToLibrary")}>
            <ArrowLeft className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{t("reader.back")}</span>
          </Link>
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
  /// The PDF tool is the one heavy panel, so it mounts on first use and stays
  /// mounted afterwards to keep scroll position and viewer state.
  const [pdfMounted, setPdfMounted] = useState(false);
  const scrollFn = useRef<((id: string) => void) | null>(null);
  const pendingJumpId = useRef<string | null>(null);
  const highlightsRef = useRef<Highlight[]>([]);
  const currentHighlightIdx = useRef(-1);

  const paperQ = useQuery({
    queryKey: ["paper", paperId],
    queryFn: () => libraryClient.paperGet(paperId),
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

  const handleScrollRef = useCallback((fn: (id: string) => void) => {
    scrollFn.current = fn;
    if (pendingJumpId.current) {
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
  const hostAction = useCallback(
    (message: ReadingHostAction) => {
      switch (message.action) {
        case "notes":
        case "highlights":
        case "terms":
        case "cached":
        case "pdf":
          openExtras(message.action);
          return;
        default:
          host.onAction(message);
      }
    },
    [host, openExtras],
  );

  const legacy = useLegacyTranslation(paperId);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("button, a, [role='dialog']") || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

      if (e.key === "?") {
        e.preventDefault();
        setShowHelp((prev) => !prev);
        return;
      }

      const highlights = highlightsRef.current;
      if (highlights.length > 0 && (e.key === "j" || e.key === "]")) {
        e.preventDefault();
        currentHighlightIdx.current = Math.min(currentHighlightIdx.current + 1, highlights.length - 1);
        handleJump(highlights[currentHighlightIdx.current]);
      } else if (highlights.length > 0 && (e.key === "k" || e.key === "[")) {
        e.preventDefault();
        currentHighlightIdx.current = Math.max(currentHighlightIdx.current - 1, 0);
        handleJump(highlights[currentHighlightIdx.current]);
      } else if (e.key === "1" || e.key === "2" || e.key === "3") {
        e.preventDefault();
        openExtras(e.key === "1" ? "notes" : e.key === "2" ? "translate" : "terms");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleJump, openExtras]);

  if (paperQ.isLoading) {
    return <MessageScreen title={t("common.loading")} backLink="/library" />;
  }
  if (!paperQ.data) {
    return <MessageScreen icon={<AlertTriangle className="h-6 w-6 text-litera-warn" />} title={t("reader.notFound")} backLink="/library" />;
  }
  const paper = paperQ.data;

  const extrasToggle = (
    <button
      onClick={() => setExtrasOpen((open) => !open)}
      className={cn("litera-icon-btn shrink-0", extrasOpen && "bg-litera-accent/12 text-litera-accent")}
      title={t("reader.extrasToggle")}
      aria-label={t("reader.extrasToggle")}
      aria-pressed={extrasOpen}
      aria-controls="reader-extras"
    >
      {extrasOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
    </button>
  );

  return (
    <div className="h-full flex flex-col">
      {!compact && <ReaderOnboarding />}
      {effectiveCompact ? (
        <header className="reader-toolbar reader-toolbar-compact">
          {!compact && (
            <Link to="/library" className="litera-icon-btn shrink-0" title={t("reader.backToLibrary")} aria-label={t("reader.backToLibrary")}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-serif text-sm text-litera-text" title={paper.title}>{paper.title}</h1>
          </div>
          {extrasToggle}
        </header>
      ) : (
        <header className="reader-toolbar">
          <Link to="/library" className="litera-icon-btn shrink-0" title={t("reader.backToLibrary")} aria-label={t("reader.backToLibrary")}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-serif text-base text-litera-text" title={paper.title}>{paper.title}</h1>
            <div className="truncate text-[11px] text-litera-mute">
              {paper.authors.slice(0, 3).join(", ")}{paper.authors.length > 3 ? " et al." : ""}
              {paper.year ? ` · ${paper.year}` : ""}
              {paper.venue ? ` · ${paper.venue}` : ""}
              {paper.arxiv_id ? ` · arXiv:${paper.arxiv_id}` : ""}
            </div>
          </div>
          <div className="reader-toolbar-group">
            {extrasToggle}
            {onOpenSplit && <SplitPaperPicker currentPaperId={paperId} onOpenSplit={onOpenSplit} />}
          </div>
        </header>
      )}
      <div className="flex-1 min-h-0">
        <PanelGroup direction="horizontal" autoSaveId={effectiveCompact ? undefined : "litera-reader-layout"}>
          <Panel id="reader-document" order={1} defaultSize={extrasOpen ? 66 : 100} minSize={35}>
            <EasyReadFrame paperId={paperId} onAction={hostAction} />
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
                  highlightsRef={highlightsRef}
                  onTranslateSelection={handleTranslateSelection}
                />
              </Panel>
            </>
          )}
        </PanelGroup>
      </div>
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
  highlightsRef,
  onTranslateSelection,
}: {
  paperId: string;
  tab: ExtrasTab;
  onTabChange: (tab: ExtrasTab) => void;
  selectionText: string;
  pdfMounted: boolean;
  pdfPage: number | null;
  onScrollRef: (fn: (id: string) => void) => void;
  onJump: (highlight: Highlight) => void;
  onOpenPdfPage: (page: number) => void;
  legacy: LegacyTranslationState;
  highlightsRef: React.MutableRefObject<Highlight[]>;
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
        <span className="litera-section-label">{t("reader.extrasTitle")}</span>
        <div className="flex items-center gap-1" role="tablist" aria-label={t("reader.extrasTitle")}>
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
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 min-h-0 relative">
        <div className={cn("h-full", tab !== "notes" && "hidden")}>
          <NoteSectionsPane paperId={paperId} />
        </div>
        <div className={cn("h-full absolute inset-0", tab !== "highlights" && "hidden")}>
          <HighlightList paperId={paperId} onJump={onJump} highlightsRef={highlightsRef} />
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
  currentPaperId,
  onOpenSplit,
}: {
  currentPaperId: string;
  onOpenSplit: (id: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const papersQ = useQuery({
    queryKey: ["readerSplitPaperSearch", query],
    queryFn: async () => {
      const trimmed = query.trim();
      return trimmed ? libraryClient.papersSearch(trimmed, 8) : libraryClient.papersRecent(8);
    },
    enabled: open,
    staleTime: 5_000,
  });

  const papers: Paper[] = (papersQ.data ?? []).filter((paper) => paper.id !== currentPaperId);
  const focusedPaper = papers[focusedIndex];

  useEffect(() => {
    if (!open) return;
    setFocusedIndex(0);
  }, [open, query]);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  function pickPaper(paper: Paper) {
    onOpenSplit(paper.id);
    setOpen(false);
    setQuery("");
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
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
      pickPaper(focusedPaper);
    }
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        onClick={() => setOpen((value) => !value)}
        className={`litera-btn text-xs ${open ? "bg-litera-accent/15 text-litera-accent border-litera-accent/30" : ""}`}
        title={t("reader.splitView")}
        aria-label={t("reader.splitView")}
        aria-expanded={open}
      >
        <Columns2 className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-[360px] max-w-[calc(100vw-2rem)] litera-panel shadow-xl">
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
                    onClick={() => pickPaper(paper)}
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
      )}
    </div>
  );
}
