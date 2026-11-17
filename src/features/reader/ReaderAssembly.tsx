import { useParams, Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { ArrowLeft, AlertTriangle, BookOpenText, ClipboardCopy, Columns2, FileText, Loader2, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Search, X } from "lucide-react";
import { PanelGroup, Panel, PanelResizeHandle, type ImperativePanelHandle } from "react-resizable-panels";
import { libraryClient, type Paper } from "@/core/data";
import { useT } from "@/i18n/I18nProvider";
import { useNarrowLayout } from "@/hooks/useNarrowLayout";
import { HighlightList } from "@/pages/reader/HighlightList";
import { PdfPane } from "@/pages/reader/PdfPane";
import { ReaderWorkspacePane, type ReaderWorkspaceTab } from "@/pages/reader/ReaderWorkspacePane";
import { ReaderOnboarding } from "@/pages/reader/ReaderOnboarding";
import { MessageScreen } from "@/pages/reader/ReaderMessageScreen";
import { HelpPanel } from "@/pages/reader/HelpPanel";
import { TranslatedMarkdownPane } from "@/pages/reader/TranslatedMarkdownPane";
import { resolveHighlightJump, type ReaderMainMode } from "@/pages/reader/readerState";
import { READER_COMPACT_TITLE_CLASS } from "@/pages/reader/readerLayout";

/**
 * Paper-first reader with PDF comparison, annotations, and split-paper view.
 *
 *   [highlights]  ║  [paper text / PDF]  ║  [PDF comparison / notes]
 *
 * Keep the existing PDF viewer for highlights and page-bound annotations.
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
    searchParams.delete("split");
    setSearchParams(searchParams, { replace: true });
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
              <ReaderSinglePane paperId={paperId} compact />
            </Panel>
            <PanelResizeHandle className="reader-resize-handle">
              <div className="reader-resize-grip" />
            </PanelResizeHandle>
            <Panel defaultSize={50} minSize={30}>
              <ReaderSinglePane paperId={splitId} compact onOpenSplit={openSplit} />
            </Panel>
          </PanelGroup>
        </div>
      </section>
    );
  }

  return <ReaderSinglePane paperId={paperId} onOpenSplit={openSplit} />;
}

/** One paper's text, PDF annotations, and workspace. */
function ReaderSinglePane({
  paperId,
  compact,
  onOpenSplit,
}: {
  paperId: string;
  compact?: boolean;
  onOpenSplit?: (id: string) => void;
}) {
  const t = useT();
  const [activeTab, setActiveTab] = useState<ReaderWorkspaceTab>("notes");
  const [showHelp, setShowHelp] = useState(false);
  const [mainMode, setMainMode] = useState<ReaderMainMode>("native");
  const [sideMode, setSideMode] = useState<"workspace" | "pdf">("workspace");
  const [documentMode, setDocumentMode] = useState<"translated" | "original" | "bilingual">("translated");
  const isNarrow = useNarrowLayout(1200);
  const effectiveCompact = compact || isNarrow;
  const paperQ = useQuery({
    queryKey: ["paper", paperId],
    queryFn: () => libraryClient.paperGet(paperId),
  });
  const scrollFn = useRef<((id: string) => void) | null>(null);
  const pendingJumpId = useRef<string | null>(null);
  const highlightsRef = useRef<Array<{ id: string }>>([]);
  const currentHighlightIdx = useRef<number>(-1);
  const setSelectionTextRef = useRef<((text: string) => void) | null>(null);
  const pendingSelectionText = useRef<string | null>(null);
  const [pdfPage, setPdfPage] = useState<number | null>(null);

  // The side panel is optional so the reading column has room for long-form text.
  const leftPanelRef = useRef<ImperativePanelHandle>(null);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(true);
  const toggleLeft = useCallback(() => {
    const panel = leftPanelRef.current;
    if (!panel) return;
    panel.isCollapsed() ? panel.expand() : panel.collapse();
  }, []);
  const openWorkspace = useCallback(() => {
    setSideMode("workspace");
    setRightCollapsed(false);
  }, []);
  const toggleRight = useCallback(() => {
    if (sideMode !== "workspace" || rightCollapsed) openWorkspace();
    else setRightCollapsed(true);
  }, [openWorkspace, rightCollapsed, sideMode]);
  const toggleComparison = useCallback(() => {
    if (sideMode === "pdf" && !rightCollapsed) {
      setRightCollapsed(true);
    } else {
      setSideMode("pdf");
      setRightCollapsed(false);
    }
  }, [rightCollapsed, sideMode]);

  const handleScrollRef = useCallback((fn: (id: string) => void) => {
    scrollFn.current = fn;
    if (pendingJumpId.current) {
      fn(pendingJumpId.current);
      pendingJumpId.current = null;
    }
  }, []);
  useEffect(() => {
    if (mainMode !== "pdf") {
      scrollFn.current = null;
    }
  }, [mainMode]);
  const handleTranslateSelection = useCallback((text: string) => {
    pendingSelectionText.current = text;
    setSelectionTextRef.current?.(text);
    setActiveTab("translate");
    openWorkspace();
  }, [openWorkspace]);
  const handleSelectionSetterReady = useCallback((setter: (text: string) => void) => {
    setSelectionTextRef.current = setter;
    if (pendingSelectionText.current) setter(pendingSelectionText.current);
    pendingSelectionText.current = null;
  }, []);
  const handleJump = useCallback((h: { id: string }) => {
    const decision = resolveHighlightJump({
      mode: mainMode,
      highlightId: h.id,
      canScroll: !!scrollFn.current,
    });
    if (decision.pendingJumpId) {
      pendingJumpId.current = decision.pendingJumpId;
    }
    if (decision.mode !== mainMode) {
      scrollFn.current = null;
      setMainMode(decision.mode);
      return;
    }
    if (decision.scrollNow) {
      scrollFn.current?.(h.id);
    }
  }, [mainMode]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("button, a, [role='dialog']") || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      
      // Toggle help with ?
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
        setActiveTab(e.key === "1" ? "notes" : e.key === "2" ? "translate" : "terms");
        openWorkspace();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleJump, openWorkspace]);

  if (paperQ.isLoading) {
    return <MessageScreen title={t("common.loading")} backLink="/library" />;
  }
  if (!paperQ.data) {
    return <MessageScreen icon={<AlertTriangle className="h-6 w-6 text-litera-warn" />} title={t("reader.notFound")} backLink="/library" />;
  }
  const paper = paperQ.data;
  if (!paper.pdf_path) {
    return (
      <MessageScreen
        icon={<AlertTriangle className="h-6 w-6 text-litera-warn" />}
        title={t("reader.noPdf")}
        subtitle={t("reader.noPdfHint")}
        backLink="/library"
      />
    );
  }

  return (
    <div className="h-full flex flex-col">
      <ReaderOnboarding />
      {!effectiveCompact && (
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
          {paper.bibtex && (
            <button
              onClick={() => navigator.clipboard.writeText(paper.bibtex!)}
              className="litera-icon-btn"
              title={t("reader.copyBibtex")}
              aria-label={t("reader.copyBibtex")}
            >
              <ClipboardCopy className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => setMainMode("native")}
            className={`litera-btn text-xs ${mainMode === "native" ? "border-litera-accent/60 bg-litera-accent/12 text-litera-accent" : ""}`}
            aria-pressed={mainMode === "native"}
          >
            <BookOpenText className="h-3.5 w-3.5" /> {t("reader.nativeReadTitle")}
          </button>
          <button
            onClick={() => setMainMode("pdf")}
            className={`litera-btn text-xs ${mainMode === "pdf" ? "border-litera-accent/60 bg-litera-accent/12 text-litera-accent" : ""}`}
            aria-pressed={mainMode === "pdf"}
          >
            <FileText className="h-3.5 w-3.5" /> {t("reader.showPdf")}
          </button>
          {mainMode === "native" && (
            <button onClick={toggleComparison} className={`litera-btn text-xs ${sideMode === "pdf" && !rightCollapsed ? "border-litera-accent/60 bg-litera-accent/12 text-litera-accent" : ""}`} aria-pressed={sideMode === "pdf" && !rightCollapsed}>
              <Columns2 className="h-3.5 w-3.5" /> {t("reader.docComparePdf")}
            </button>
          )}
          <button
            onClick={toggleLeft}
            className={`litera-icon-btn ${leftCollapsed ? "" : "bg-litera-accent/12 text-litera-accent"}`}
            title={t("reader.toggleHighlights")}
            aria-label={t("reader.toggleHighlights")}
            aria-pressed={!leftCollapsed}
          >
            {leftCollapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={toggleRight}
            className={`litera-icon-btn ${rightCollapsed || sideMode !== "workspace" ? "" : "bg-litera-accent/12 text-litera-accent"}`}
            title={t("reader.toggleWorkspace")}
            aria-label={t("reader.toggleWorkspace")}
            aria-pressed={!rightCollapsed && sideMode === "workspace"}
          >
            {rightCollapsed || sideMode !== "workspace" ? <PanelRightOpen className="h-3.5 w-3.5" /> : <PanelRightClose className="h-3.5 w-3.5" />}
          </button>
          {onOpenSplit && <SplitPaperPicker currentPaperId={paperId} onOpenSplit={onOpenSplit} />}
          </div>
        </header>
      )}
      {effectiveCompact && (
        <header className="reader-toolbar reader-toolbar-compact">
          <Link to="/library" className="litera-icon-btn shrink-0" title={t("reader.backToLibrary")} aria-label={t("reader.backToLibrary")}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className={READER_COMPACT_TITLE_CLASS}>
            <h1 className="truncate font-serif text-sm text-litera-text" title={paper.title}>{paper.title}</h1>
          </div>
          {paper.bibtex && (
            <button
              onClick={() => navigator.clipboard.writeText(paper.bibtex!)}
              className="litera-icon-btn"
              title={t("reader.copyBibtex")}
              aria-label={t("reader.copyBibtex")}
            >
              <ClipboardCopy className="h-3 w-3" />
            </button>
          )}
          <button onClick={() => setMainMode("native")} className={`litera-icon-btn ${mainMode === "native" ? "text-litera-accent" : ""}`} title={t("reader.nativeReadTitle")} aria-label={t("reader.nativeReadTitle")} aria-pressed={mainMode === "native"}>
            <BookOpenText className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setMainMode("pdf")} className={`litera-icon-btn ${mainMode === "pdf" ? "text-litera-accent" : ""}`} title={t("reader.showPdf")} aria-label={t("reader.showPdf")} aria-pressed={mainMode === "pdf"}>
            <FileText className="h-3.5 w-3.5" />
          </button>
          {mainMode === "native" && <button onClick={toggleComparison} className={`litera-icon-btn ${sideMode === "pdf" && !rightCollapsed ? "text-litera-accent" : ""}`} title={t("reader.docComparePdf")} aria-label={t("reader.docComparePdf")} aria-pressed={sideMode === "pdf" && !rightCollapsed}><Columns2 className="h-3.5 w-3.5" /></button>}
          <button onClick={toggleRight} className={`litera-icon-btn ${!rightCollapsed && sideMode === "workspace" ? "text-litera-accent" : ""}`} title={t("reader.toggleWorkspace")} aria-label={t("reader.toggleWorkspace")} aria-pressed={!rightCollapsed && sideMode === "workspace"}><PanelRightOpen className="h-3.5 w-3.5" /></button>
        </header>
      )}
      <div className="flex-1 min-h-0">
        <PanelGroup direction="horizontal" autoSaveId={effectiveCompact ? undefined : "litera-reader-reading-layout"}>
          {!effectiveCompact && (
            <>
              <Panel
                id="reader-highlights"
                order={1}
                ref={leftPanelRef}
                defaultSize={16}
                minSize={10}
                maxSize={24}
                collapsible
                collapsedSize={0}
                onCollapse={() => setLeftCollapsed(true)}
                onExpand={() => setLeftCollapsed(false)}
              >
                <HighlightList paperId={paperId} onJump={handleJump} highlightsRef={highlightsRef} />
              </Panel>
              <PanelResizeHandle className={`reader-resize-handle ${leftCollapsed ? "hidden" : ""}`}>
                <div className="reader-resize-grip" />
              </PanelResizeHandle>
            </>
          )}
          <Panel id="reader-document" order={2} defaultSize={effectiveCompact ? 100 : 84} minSize={30}>
            {mainMode === "native" ? (
              <TranslatedMarkdownPane
                paperId={paperId}
                paperTitle={paper.title}
                mode={documentMode}
                onModeChange={setDocumentMode}
                pdfComparisonActive={sideMode === "pdf" && !rightCollapsed}
                onOpenPdf={() => setMainMode("pdf")}
                onOpenPdfPage={(page) => {
                  setPdfPage(page);
                  setSideMode("pdf");
                  setRightCollapsed(false);
                }}
              />
            ) : (
              <PdfPane paperId={paperId} pageToOpen={pdfPage} scrollRefCb={handleScrollRef} onTranslateSelection={handleTranslateSelection} />
            )}
          </Panel>
          {!rightCollapsed && (
            <>
              <PanelResizeHandle className="reader-resize-handle">
                <div className="reader-resize-grip" />
              </PanelResizeHandle>
              <Panel
                id="reader-workspace"
                order={3}
                defaultSize={effectiveCompact ? 40 : 34}
                minSize={25}
                maxSize={55}
                onCollapse={() => setRightCollapsed(true)}
                onExpand={() => setRightCollapsed(false)}
              >
                {mainMode === "native" && sideMode === "pdf" ? (
                  <PdfPane paperId={paperId} pageToOpen={pdfPage} onTranslateSelection={handleTranslateSelection} />
                ) : (
                  <ReaderWorkspacePane
                    paperId={paperId}
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    onSelectionSetterReady={handleSelectionSetterReady}
                  />
                )}
              </Panel>
            </>
          )}
        </PanelGroup>
      </div>
      {showHelp && <HelpPanel onClose={() => setShowHelp(false)} />}
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
            <div className="flex items-center gap-2 px-3 py-3 text-xs text-litera-mute">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("reader.splitSearching")}
            </div>
          ) : papersQ.isError ? (
            <div className="px-3 py-3 text-xs text-litera-error">
              {t("reader.splitSearchFailed")}
            </div>
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
