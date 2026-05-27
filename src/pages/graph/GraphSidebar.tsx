import { ExternalLink, Loader2, MapPin, Sparkles, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, type GraphNode, type GraphData } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";

interface Props {
  node: GraphNode | null;
  graphData: GraphData;
  onClose: () => void;
  onCenterConcept: (term: string) => void;
}

export function GraphSidebar({ node, graphData, onClose, onCenterConcept }: Props) {
  const t = useT();
  const navigate = useNavigate();

  const { data: paper, isLoading: paperLoading } = useQuery({
    queryKey: ["paper", node?.id],
    queryFn: () => api.paperGet(node!.id),
    enabled: !!node && node.node_type === "paper",
    staleTime: 30_000,
  });

  if (!node) return null;

  const connectedEdges = graphData.edges.filter(
    (e) => e.source === node.id || e.target === node.id,
  );
  const connectedNodeIds = new Set(
    connectedEdges.flatMap((e) => [e.source, e.target]).filter((id) => id !== node.id),
  );
  const connectedNodes = graphData.nodes.filter((n) => connectedNodeIds.has(n.id));

  return (
    <div className="w-[320px] shrink-0 border-l border-litera-line bg-litera-paper/60 overflow-y-auto">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-litera-line">
        <h3 className="text-sm font-medium text-litera-text truncate flex-1">{node.label}</h3>
        <button onClick={onClose} className="text-litera-mute hover:text-litera-text ml-2">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-3 space-y-3">
        {node.node_type === "paper" ? (
          <PaperDetail
            node={node}
            paper={paper}
            loading={paperLoading}
            onOpenReader={() => navigate(`/reader/${node.id}`)}
          />
        ) : (
          <ConceptDetail
            node={node}
            onCenterConcept={onCenterConcept}
          />
        )}

        {/* Connected nodes */}
        {connectedNodes.length > 0 && (
          <div className="border-t border-litera-line pt-3">
            <h4 className="text-xs font-medium text-litera-text/70 mb-2">
              {t("graph.linkedPapers")} ({connectedNodes.length})
            </h4>
            <div className="space-y-1.5">
              {connectedNodes.map((cn) => {
                const edge = connectedEdges.find(
                  (e) =>
                    (e.source === node.id && e.target === cn.id) ||
                    (e.target === node.id && e.source === cn.id),
                );
                return (
                  <div key={cn.id} className="rounded-md bg-litera-panel/60 px-2 py-1.5">
                    <p className="text-xs text-litera-text truncate">{cn.label}</p>
                    {edge && (
                      <span className="text-[11px] text-litera-mute">
                        {t(`relation.${edge.edge_type}` as any)}
                        {edge.source_type === "ai" && ` · AI ${(edge.confidence * 100).toFixed(0)}%`}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PaperDetail({
  node, paper, loading, onOpenReader,
}: {
  node: GraphNode;
  paper: any;
  loading: boolean;
  onOpenReader: () => void;
}) {
  const t = useT();
  return (
    <>
      {/* Metadata block */}
      <div className="rounded-lg border border-litera-line bg-litera-panel/40 p-3 space-y-2">
        {node.sublabel && (
          <p className="text-xs text-litera-mute">{node.sublabel}</p>
        )}
        {node.year && (
          <p className="text-xs text-litera-mute">{node.year}</p>
        )}
        {node.read_status && (
          <span className="inline-block px-2 py-0.5 rounded-full text-[11px] bg-litera-panel text-litera-mute">
            {node.read_status}
          </span>
        )}
        {loading && (
          <div className="flex items-center gap-2 text-xs text-litera-mute">
            <Loader2 className="h-3 w-3 animate-spin" /> {t("common.loading")}
          </div>
        )}
        {paper?.abstract_text && (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-litera-mute mb-1">{t("graph.abstract")}</div>
            <p className="text-xs text-litera-text/80 leading-relaxed">{paper.abstract_text}</p>
          </div>
        )}
        {paper?.tldr && (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-litera-mute mb-1 flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> TL;DR
            </div>
            <p className="text-xs text-litera-text/80 leading-relaxed">{paper.tldr}</p>
          </div>
        )}
        {paper?.key_findings && paper.key_findings.length > 0 && (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-litera-mute mb-1">{t("graph.keyFindings")}</div>
            <ul className="text-xs text-litera-text/70 ml-3 list-disc space-y-0.5">
              {paper.key_findings.slice(0, 4).map((f: string, i: number) => <li key={i}>{f}</li>)}
            </ul>
          </div>
        )}
        {paper?.method && (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-litera-mute mb-1">{t("graph.method")}</div>
            <p className="text-xs text-litera-text/80 leading-relaxed">{paper.method}</p>
          </div>
        )}
      </div>

      <button
        onClick={onOpenReader}
        className="flex items-center gap-1.5 text-xs text-litera-accent hover:underline"
      >
        <ExternalLink className="h-3 w-3" />
        {t("graph.openInReader")}
      </button>
    </>
  );
}

function ConceptDetail({
  node, onCenterConcept,
}: {
  node: GraphNode;
  onCenterConcept: (term: string) => void;
}) {
  const t = useT();
  return (
    <>
      {node.sublabel && (
        <p className="text-xs text-litera-mute italic">{node.sublabel}</p>
      )}
      {node.paper_count != null && (
        <p className="text-xs text-litera-mute">
          {node.paper_count} {t("graph.papers")}
        </p>
      )}
      <button
        onClick={() => onCenterConcept(node.label)}
        className="flex items-center gap-1.5 text-xs text-litera-accent hover:underline"
      >
        <MapPin className="h-3 w-3" />
        {t("graph.centerInMindmap")}
      </button>
    </>
  );
}
