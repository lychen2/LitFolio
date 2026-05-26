import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import { api } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";
import { HighlightList } from "./reader/HighlightList";
import { PdfPane } from "./reader/PdfPane";
import { ReaderWorkspacePane, type ReaderWorkspaceTab } from "./reader/ReaderWorkspacePane";
import { ReaderOnboarding } from "./reader/ReaderOnboarding";

/**
 * Three-pane PDF reader.
 *
 *   [highlights]  ║  [pdf viewer]  ║  [notes]
 *
 * - Left: list of all highlights for this paper; clicking one scrolls the PDF pane.
 * - Middle: PDF.js via react-pdf-highlighter — select text to highlight.
 * - Right: Markdown note autosaved to papers/<id>/note.md.
 *
 * Panel widths are user-resizable via react-resizable-panels.
 */
export function ReaderPage() {
  const t = useT();
  const { paperId } = useParams<{ paperId: string }>();
  const [activeTab, setActiveTab] = useState<ReaderWorkspaceTab>("notes");
  const [selectionText, setSelectionText] = useState("");
  const paperQ = useQuery({
    queryKey: ["paper", paperId],
    queryFn: () => paperId ? api.paperGet(paperId) : Promise.resolve(null),
    enabled: !!paperId,
  });
  const scrollFn = useRef<((id: string) => void) | null>(null);
  const highlightsRef = useRef<Array<{ id: string }>>([]);
  const currentHighlightIdx = useRef<number>(-1);

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

  if (!paperId) {
    return <MessageScreen icon={<AlertTriangle className="h-6 w-6 text-amber-400" />} title={t("reader.noId")} backLink="/library" />;
  }
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
    <section className="h-full flex flex-col">
      <ReaderOnboarding />
      <header className="border-b border-litera-line px-4 py-2 flex items-center gap-3 shrink-0">
        <Link
          to="/library"
          className="litera-btn text-xs"
          title={t("reader.backToLibrary")}
        >
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
      </header>
      <div className="flex-1 min-h-0">
        <PanelGroup direction="horizontal" autoSaveId="litera-reader-layout">
          <Panel defaultSize={16} minSize={10} maxSize={24}>
            <HighlightList
              paperId={paperId}
              onJump={(h) => scrollFn.current?.(h.id)}
              highlightsRef={highlightsRef}
            />
          </Panel>
          <PanelResizeHandle className="w-px bg-litera-line hover:bg-litera-accent/40 transition-colors" />
          <Panel defaultSize={52} minSize={30}>
            <PdfPane
              paperId={paperId}
              scrollRefCb={(fn) => { scrollFn.current = fn; }}
              onTranslateSelection={(text) => {
                setSelectionText(text);
                setActiveTab("translate");
              }}
            />
          </Panel>
          <PanelResizeHandle className="w-px bg-litera-line hover:bg-litera-accent/40 transition-colors" />
          <Panel defaultSize={28} minSize={15} maxSize={45}>
            <ReaderWorkspacePane
              paperId={paperId}
              activeTab={activeTab}
              selectionText={selectionText}
              onTabChange={setActiveTab}
            />
          </Panel>
        </PanelGroup>
      </div>
    </section>
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
