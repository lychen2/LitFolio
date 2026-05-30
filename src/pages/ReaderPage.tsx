import { useParams, Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, AlertTriangle, ClipboardCopy, Columns2, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, X } from "lucide-react";
import { PanelGroup, Panel, PanelResizeHandle, type ImperativePanelHandle } from "react-resizable-panels";
import { api } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";
import { HighlightList } from "./reader/HighlightList";
import { PdfPane } from "./reader/PdfPane";
import { ReaderWorkspacePane, type ReaderWorkspaceTab } from "./reader/ReaderWorkspacePane";
import { ReaderOnboarding } from "./reader/ReaderOnboarding";

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
            <button
              onClick={() => {
                const id = prompt(t("reader.splitPrompt"));
                if (id) onOpenSplit(id);
              }}
              className="litera-btn text-xs shrink-0"
              title={t("reader.splitView")}
              aria-label={t("reader.splitView")}
            >
              <Columns2 className="h-3.5 w-3.5" />
            </button>
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

function MessageScreen({ icon, title, subtitle, backLink }: {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  backLink: string;
}) {
  const t = useT();
  return (
    <section className="h-full grid place-items-center text-center">
      <div>
        {icon && <div className="mb-2 flex justify-center">{icon}</div>}
        <div className="text-sm text-litera-text">{title}</div>
        {subtitle && <div className="text-xs text-litera-mute mt-1">{subtitle}</div>}
        <Link to={backLink} className="litera-btn text-xs mt-4 inline-flex">
          <ArrowLeft className="h-3.5 w-3.5" /> {t("reader.backToLibrary")}
        </Link>
      </div>
    </section>
  );
}
