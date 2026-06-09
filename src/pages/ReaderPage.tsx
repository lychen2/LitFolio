import { useParams, Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { ArrowLeft, AlertTriangle, ClipboardCopy, Columns2, Loader2, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Search, X } from "lucide-react";
import { PanelGroup, Panel, PanelResizeHandle, type ImperativePanelHandle } from "react-resizable-panels";
import { api, type Paper } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";
import { HighlightList } from "./reader/HighlightList";
import { PdfPane } from "./reader/PdfPane";
import { ReaderWorkspacePane, type ReaderWorkspaceTab } from "./reader/ReaderWorkspacePane";
import { ReaderOnboarding } from "./reader/ReaderOnboarding";
import { MessageScreen } from "./reader/ReaderMessageScreen";

/**
 * Three-pane PDF reader with optional split view.
 *
 *   [highlights]  ║  [pdf viewer]  ║  [notes]
 *
 * Panel widths are user-resizable via react-resizable-panels.
 * Split view: two independent readers side by side.
 */
export function ReaderPage() {
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
    return <MessageScreen icon={<AlertTriangle className="h-6 w-6 text-amber-400" />} title={t("reader.noId")} backLink="/library" />;
  }

  if (splitId) {
    return (
      <section className="h-full flex flex-col">
        <ReaderOnboarding />
        <header className="border-b border-litera-line px-4 py-1.5 flex items-center gap-2 shrink-0">
          <Link to="/library" className="litera-btn text-xs">
            <ArrowLeft className="h-3.5 w-3.5" /> {t("reader.back")}
          </Link>
          <div className="flex-1 text-xs text-litera-mute">{t("reader.splitView")}</div>
          <button onClick={closeSplit} className="litera-btn text-xs">
            <X className="h-3.5 w-3.5" /> {t("reader.closeSplit")}
          </button>
        </header>
        <div className="flex-1 min-h-0">
          <PanelGroup direction="horizontal">
            <Panel defaultSize={50} minSize={30}>
              <ReaderSinglePane paperId={paperId} compact />
            </Panel>
            <PanelResizeHandle className="w-2 relative group/handle cursor-col-resize">
              <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-litera-line group-hover/handle:bg-litera-accent/40 transition-colors" />
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

/** A complete single-reader pane (highlights + pdf + workspace). */
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
  const paperQ = useQuery({
    queryKey: ["paper", paperId],
    queryFn: () => api.paperGet(paperId),
  });
  const scrollFn = useRef<((id: string) => void) | null>(null);
  const highlightsRef = useRef<Array<{ id: string }>>([]);
  const currentHighlightIdx = useRef<number>(-1);
  const setSelectionTextRef = useRef<((text: string) => void) | null>(null);

  // Collapsible side panels so the PDF can take the full width when the reader
  // wants a bigger page. Driven imperatively via panel refs; collapse state is
  // mirrored into React so the toolbar toggles can show the right icon.
  const leftPanelRef = useRef<ImperativePanelHandle>(null);
  const rightPanelRef = useRef<ImperativePanelHandle>(null);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const toggleLeft = useCallback(() => {
    const panel = leftPanelRef.current;
    if (!panel) return;
    panel.isCollapsed() ? panel.expand() : panel.collapse();
  }, []);
  const toggleRight = useCallback(() => {
    const panel = rightPanelRef.current;
    if (!panel) return;
    panel.isCollapsed() ? panel.expand() : panel.collapse();
  }, []);

  const handleScrollRef = useCallback((fn: (id: string) => void) => {
    scrollFn.current = fn;
  }, []);
  const handleTranslateSelection = useCallback((text: string) => {
    setSelectionTextRef.current?.(text);
    setActiveTab("translate");
  }, []);
  const handleSelectionSetterReady = useCallback((setter: (text: string) => void) => {
    setSelectionTextRef.current = setter;
  }, []);
  const handleJump = useCallback((h: { id: string }) => {
    scrollFn.current?.(h.id);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      const highlights = highlightsRef.current;
      if (highlights.length === 0) return;
      if (e.key === "j" || e.key === "]") {
        e.preventDefault();
        currentHighlightIdx.current = Math.min(currentHighlightIdx.current + 1, highlights.length - 1);
        scrollFn.current?.(highlights[currentHighlightIdx.current].id);
      } else if (e.key === "k" || e.key === "[") {
        e.preventDefault();
        currentHighlightIdx.current = Math.max(currentHighlightIdx.current - 1, 0);
        scrollFn.current?.(highlights[currentHighlightIdx.current].id);
      } else if (e.key === "1") {
        e.preventDefault();
        setActiveTab("notes");
      } else if (e.key === "2") {
        e.preventDefault();
        setActiveTab("translate");
      } else if (e.key === "3") {
        e.preventDefault();
        setActiveTab("terms");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (paperQ.isLoading) {
    return <MessageScreen title={t("common.loading")} backLink="/library" />;
  }
  if (!paperQ.data) {
    return <MessageScreen icon={<AlertTriangle className="h-6 w-6 text-amber-400" />} title={t("reader.notFound")} backLink="/library" />;
  }
  const paper = paperQ.data;
  if (!paper.pdf_path) {
    return (
      <MessageScreen
        icon={<AlertTriangle className="h-6 w-6 text-amber-400" />}
        title={t("reader.noPdf")}
        subtitle={t("reader.noPdfHint")}
        backLink="/library"
      />
    );
  }

  return (
    <div className="h-full flex flex-col">
      {!compact && (
        <header className="border-b border-litera-line px-4 py-2 flex items-center gap-3 shrink-0">
          <Link to="/library" className="litera-btn text-xs" title={t("reader.backToLibrary")}>
            <ArrowLeft className="h-3.5 w-3.5" /> {t("reader.back")}
          </Link>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-litera-text truncate">{paper.title}</div>
            <div className="text-[11px] text-litera-mute truncate">
              {paper.authors.slice(0, 3).join(", ")}{paper.authors.length > 3 ? " et al." : ""}
              {paper.year ? ` · ${paper.year}` : ""}
              {paper.venue ? ` · ${paper.venue}` : ""}
              {paper.arxiv_id ? ` · arXiv:${paper.arxiv_id}` : ""}
            </div>
          </div>
          {paper.bibtex && (
            <button
              onClick={() => navigator.clipboard.writeText(paper.bibtex!)}
              className="litera-btn text-xs shrink-0"
              title={t("reader.copyBibtex")}
              aria-label={t("reader.copyBibtex")}
            >
              <ClipboardCopy className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={toggleLeft}
            className={`litera-btn text-xs shrink-0 ${leftCollapsed ? "" : "bg-litera-accent/15 text-litera-accent border-litera-accent/30"}`}
            title={t("reader.toggleHighlights")}
            aria-label={t("reader.toggleHighlights")}
            aria-pressed={!leftCollapsed}
          >
            {leftCollapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={toggleRight}
            className={`litera-btn text-xs shrink-0 ${rightCollapsed ? "" : "bg-litera-accent/15 text-litera-accent border-litera-accent/30"}`}
            title={t("reader.toggleWorkspace")}
            aria-label={t("reader.toggleWorkspace")}
            aria-pressed={!rightCollapsed}
          >
            {rightCollapsed ? <PanelRightOpen className="h-3.5 w-3.5" /> : <PanelRightClose className="h-3.5 w-3.5" />}
          </button>
          {onOpenSplit && (
            <SplitPaperPicker currentPaperId={paperId} onOpenSplit={onOpenSplit} />
          )}
        </header>
      )}
      {compact && (
        <header className="border-b border-litera-line px-3 py-1.5 flex items-center gap-2 shrink-0">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-litera-text truncate">{paper.title}</div>
          </div>
          {paper.bibtex && (
            <button
              onClick={() => navigator.clipboard.writeText(paper.bibtex!)}
              className="text-litera-mute hover:text-litera-text"
              title={t("reader.copyBibtex")}
              aria-label={t("reader.copyBibtex")}
            >
              <ClipboardCopy className="h-3 w-3" />
            </button>
          )}
        </header>
      )}
      <div className="flex-1 min-h-0">
        <PanelGroup direction="horizontal" autoSaveId={compact ? undefined : "litera-reader-layout"}>
          {!compact && (
            <>
              <Panel
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
              <PanelResizeHandle className={`w-2 relative group/handle cursor-col-resize ${leftCollapsed ? "hidden" : ""}`}>
                <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-litera-line group-hover/handle:bg-litera-accent/40 transition-colors" />
              </PanelResizeHandle>
            </>
          )}
          <Panel defaultSize={compact ? 65 : 52} minSize={30}>
            <PdfPane paperId={paperId} scrollRefCb={handleScrollRef} onTranslateSelection={handleTranslateSelection} />
          </Panel>
          <PanelResizeHandle className={`w-2 relative group/handle cursor-col-resize ${rightCollapsed ? "hidden" : ""}`}>
            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-litera-line group-hover/handle:bg-litera-accent/40 transition-colors" />
          </PanelResizeHandle>
          <Panel
            ref={compact ? undefined : rightPanelRef}
            defaultSize={compact ? 35 : 28}
            minSize={15}
            maxSize={45}
            collapsible={!compact}
            collapsedSize={0}
            onCollapse={() => setRightCollapsed(true)}
            onExpand={() => setRightCollapsed(false)}
          >
            <ReaderWorkspacePane
              paperId={paperId}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onSelectionSetterReady={handleSelectionSetterReady}
            />
          </Panel>
        </PanelGroup>
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
      return trimmed ? api.papersSearch(trimmed, 8) : api.papersRecent(8);
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
            <div className="px-3 py-3 text-xs text-red-400">
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
