import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "@/i18n/I18nProvider";
import { api, type GraphFilter } from "@/lib/api";
import { errorMessage } from "@/lib/error";
import { GraphToolbar } from "./graph/GraphToolbar";
import { NetworkGraphView } from "./graph/NetworkGraphView";
import { MindmapView } from "./graph/MindmapView";
import { GraphSidebar } from "./graph/GraphSidebar";
import { GraphLegend } from "./graph/GraphLegend";
import { LinkCreateDialog } from "./graph/LinkCreateDialog";
import { GraphDecisionPanel } from "./graph/GraphDecisionPanel";
import { graphRenderProfile } from "./graph/graphPerformance";

const ALL_RELATIONS = ["extends", "contradicts", "compares", "builds_on", "uses_method", "related"];

export function GraphPage() {
  const t = useT();
  const qc = useQueryClient();
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  // State
  const [viewMode, setViewMode] = useState<"network" | "mindmap">("network");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [includeConcepts, setIncludeConcepts] = useState(true);
  const [activeRelations, setActiveRelations] = useState<string[]>([...ALL_RELATIONS]);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [aiRunning, setAiRunning] = useState(false);
  const [extractingConcepts, setExtractingConcepts] = useState(false);
  const [conceptRunSummary, setConceptRunSummary] = useState<string | null>(null);
  const [centerConcept, setCenterConcept] = useState<string | null>(null);

  // Measure container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Build filter
  const filter: GraphFilter = {
    relations: activeRelations.length === ALL_RELATIONS.length ? undefined : activeRelations,
    include_concepts: includeConcepts,
  };

  // Fetch graph data
  const { data: graphData, isLoading } = useQuery({
    queryKey: ["graph", filter],
    queryFn: () => api.graphData(filter),
  });

  const gd = graphData ?? { nodes: [], edges: [] };
  const renderProfile = graphRenderProfile({
    nodeCount: gd.nodes.length,
    edgeCount: gd.edges.length,
  });

  // Selected node
  const selectedNode = gd.nodes.find((n) => n.id === selectedNodeId) ?? null;

  // Paper list for link dialog
  const { data: allPapers } = useQuery({
    queryKey: ["papers-recent-for-link"],
    queryFn: () => api.papersRecent(500),
  });

  // Handlers
  const handleRelationToggle = useCallback((r: string) => {
    setActiveRelations((prev) =>
      prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r],
    );
  }, []);

  const handleAiDiscover = useCallback(async () => {
    setAiRunning(true);
    try {
      await api.aiDiscoverLinks();
      qc.invalidateQueries({ queryKey: ["graph"] });
    } finally {
      setAiRunning(false);
    }
  }, [qc]);

  const handleExtractConcepts = useCallback(async () => {
    setExtractingConcepts(true);
    setConceptRunSummary(null);
    try {
      // Get all papers and extract concepts from each
      const papers = await api.papersRecent(100);
      let totalExtracted = 0;
      const failures: string[] = [];
      for (const paper of papers) {
        try {
          const count = await api.conceptExtractAndStore(paper.id);
          totalExtracted += count;
        } catch (error) {
          const title = paper.title || paper.id;
          const message = errorMessage(error);
          console.error("concept extraction failed", { paperId: paper.id, title, error });
          failures.push(`${title}: ${message}`);
        }
      }
      const summary = `Extracted ${totalExtracted} concepts from ${papers.length - failures.length}/${papers.length} papers.`;
      setConceptRunSummary(
        failures.length === 0
          ? summary
          : `${summary} Failed ${failures.length}: ${failures.slice(0, 3).join("; ")}${failures.length > 3 ? "; ..." : ""}`,
      );
      qc.invalidateQueries({ queryKey: ["graph"] });
      qc.invalidateQueries({ queryKey: ["concepts"] });
    } finally {
      setExtractingConcepts(false);
    }
  }, [qc]);

  const handleCenterConcept = useCallback((term: string) => {
    setCenterConcept(term);
    setViewMode("mindmap");
  }, []);

  const handleLinkCreated = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["graph"] });
  }, [qc]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-litera-line px-6 py-4">
        <h1 className="font-serif text-2xl tracking-tight">
          {t("graph.title")}
        </h1>
        <p className="text-sm text-litera-mute">{t("graph.subtitle")}</p>
      </div>

      <GraphToolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        includeConcepts={includeConcepts}
        onIncludeConceptsChange={setIncludeConcepts}
        activeRelations={activeRelations}
        onRelationToggle={handleRelationToggle}
        onAiDiscover={handleAiDiscover}
        onAddLink={() => setShowLinkDialog(true)}
        onExtractConcepts={handleExtractConcepts}
        aiRunning={aiRunning}
        extractingConcepts={extractingConcepts}
      />
      {conceptRunSummary && (
        <div className="border-b border-litera-line px-6 py-2 text-xs text-litera-mute">
          {conceptRunSummary}
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Graph area */}
        <div ref={containerRef} className="flex-1 relative bg-litera-bg min-w-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-sm text-litera-mute">
              Loading…
            </div>
          ) : gd.nodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-8">
              <p className="text-sm text-litera-text">{t("graph.noGraph")}</p>
              <p className="text-xs text-litera-mute max-w-xs">{t("graph.noGraphHint")}</p>
            </div>
          ) : viewMode === "network" ? (
            <NetworkGraphView
              data={gd}
              selectedNodeId={selectedNodeId}
              onSelectNode={setSelectedNodeId}
              width={size.w}
              height={size.h}
            />
          ) : (
            <MindmapView
              data={gd}
              centerConcept={centerConcept}
              onSelectNode={setSelectedNodeId}
              width={size.w}
              height={size.h}
            />
          )}
          {viewMode === "network" && renderProfile.mode !== "full" && (
            <div className="pointer-events-none absolute left-4 top-4 rounded border border-litera-line bg-litera-paper/90 px-3 py-2 text-xs text-litera-mute shadow-sm">
              {t("graph.largeMode", { nodes: gd.nodes.length, edges: gd.edges.length })}
            </div>
          )}
          {gd.nodes.length > 0 && <GraphLegend />}
        </div>

        {/* Sidebar */}
        <GraphSidebar
          node={selectedNode}
          graphData={gd}
          onClose={() => setSelectedNodeId(null)}
          onCenterConcept={handleCenterConcept}
        />
        <GraphDecisionPanel graphData={gd} onSelectNode={setSelectedNodeId} />
      </div>

      {/* Link dialog */}
      <LinkCreateDialog
        open={showLinkDialog}
        onClose={() => setShowLinkDialog(false)}
        onCreated={handleLinkCreated}
        papers={allPapers ?? []}
        defaultSourceId={selectedNode?.node_type === "paper" ? selectedNode.id : undefined}
      />
    </div>
  );
}
