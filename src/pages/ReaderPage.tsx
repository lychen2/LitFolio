import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import { api } from "@/lib/api";
import { HighlightList } from "./reader/HighlightList";
import { PdfPane } from "./reader/PdfPane";
import { NotesPane } from "./reader/NotesPane";

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
  const { paperId } = useParams<{ paperId: string }>();
  const paperQ = useQuery({
    queryKey: ["paper", paperId],
    queryFn: () => paperId ? api.paperGet(paperId) : Promise.resolve(null),
    enabled: !!paperId,
  });
  const scrollFn = useRef<((id: string) => void) | null>(null);

  if (!paperId) {
    return <MessageScreen icon={<AlertTriangle className="h-6 w-6 text-amber-400" />} title="缺少 paperId" backLink="/library" />;
  }
  if (paperQ.isLoading) {
    return <MessageScreen title="加载文献…" backLink="/library" />;
  }
  if (!paperQ.data) {
    return <MessageScreen icon={<AlertTriangle className="h-6 w-6 text-amber-400" />} title="找不到这篇文献" backLink="/library" />;
  }
  const paper = paperQ.data;
  if (!paper.pdf_path) {
    return (
      <MessageScreen
        icon={<AlertTriangle className="h-6 w-6 text-amber-400" />}
        title="这篇文献还没有绑定 PDF"
        subtitle="回到 文献库 点 📎 添加 PDF 后再来阅读。"
        backLink="/library"
      />
    );
  }

  return (
    <section className="h-full flex flex-col">
      <header className="border-b border-litera-line px-4 py-2 flex items-center gap-3 shrink-0">
        <Link
          to="/library"
          className="litera-btn text-xs"
          title="回到文献库"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> 返回
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
          <Panel defaultSize={20} minSize={12} maxSize={35}>
            <HighlightList
              paperId={paperId}
              onJump={(h) => scrollFn.current?.(h.id)}
            />
          </Panel>
          <PanelResizeHandle className="w-px bg-litera-line hover:bg-litera-accent/40 transition-colors" />
          <Panel defaultSize={55} minSize={30}>
            <PdfPane
              paperId={paperId}
              pdfPath={paper.pdf_path}
              scrollRefCb={(fn) => { scrollFn.current = fn; }}
            />
          </Panel>
          <PanelResizeHandle className="w-px bg-litera-line hover:bg-litera-accent/40 transition-colors" />
          <Panel defaultSize={25} minSize={15} maxSize={45}>
            <NotesPane paperId={paperId} />
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
  return (
    <section className="h-full grid place-items-center text-center">
      <div>
        {icon && <div className="mb-2 flex justify-center">{icon}</div>}
        <div className="text-sm text-litera-text">{title}</div>
        {subtitle && <div className="text-xs text-litera-mute mt-1">{subtitle}</div>}
        <Link to={backLink} className="litera-btn text-xs mt-4 inline-flex">
          <ArrowLeft className="h-3.5 w-3.5" /> 返回文献库
        </Link>
      </div>
    </section>
  );
}
