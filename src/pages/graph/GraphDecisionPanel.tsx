import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Layers3, Link2, ListPlus, Loader2, Network, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api, type GraphData, type GraphEdge, type GraphNode } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";
import { edgeToEvidenceDraft, graphSignals, type ClusterSignal, type ConceptSignal, type PaperSignal } from "./graphDecisionSignals";

interface Props { graphData: GraphData; onSelectNode: (id: string) => void; }

export function GraphDecisionPanel({ graphData, onSelectNode }: Props) {
  const t = useT();
  const signals = useMemo(() => graphSignals(graphData), [graphData]);

  return (
    <aside className="w-[300px] shrink-0 border-l border-litera-line bg-litera-paper/40 overflow-auto">
      <div className="border-b border-litera-line px-3 py-2.5">
        <h2 className="text-sm font-medium text-litera-text">{t("graph.decisions")}</h2>
        <p className="text-[11px] text-litera-mute">{t("graph.decisionsHint")}</p>
      </div>
      <div className="p-3 space-y-4">
        <UnreadCorePapers items={signals.unreadCorePapers} onSelectNode={onSelectNode} />
        <UnderCoveredConcepts items={signals.underCoveredConcepts} onSelectNode={onSelectNode} />
        <RelatedClusters clusters={signals.clusters} onSelectNode={onSelectNode} />
        <EvidenceChains edges={signals.evidenceChains} nodes={graphData.nodes} />
      </div>
    </aside>
  );
}

function UnreadCorePapers({
  items,
  onSelectNode,
}: {
  items: PaperSignal[];
  onSelectNode: (id: string) => void;
}) {
  const t = useT();
  return (
    <DecisionSection icon={<BookOpen className="h-3.5 w-3.5" />} title={t("graph.unreadCore")}>
      {items.length === 0 ? <EmptyLine text={t("graph.noUnreadCore")} /> : items.map((item) => (
        <PaperActionRow key={item.node.id} item={item} onSelectNode={onSelectNode} />
      ))}
    </DecisionSection>
  );
}

function UnderCoveredConcepts({
  items,
  onSelectNode,
}: {
  items: ConceptSignal[];
  onSelectNode: (id: string) => void;
}) {
  const t = useT();
  return (
    <DecisionSection icon={<Layers3 className="h-3.5 w-3.5" />} title={t("graph.underCovered")}>
      {items.length === 0 ? <EmptyLine text={t("graph.noUnderCovered")} /> : items.map((item) => (
        <button
          key={item.node.id}
          onClick={() => onSelectNode(item.node.id)}
          className="w-full text-left rounded-md border border-litera-line px-2.5 py-2 hover:bg-litera-panel/50 transition-colors"
        >
          <div className="text-xs text-litera-text truncate">{item.node.label}</div>
          <div className="text-[11px] text-litera-mute">
            {t("graph.coverageCount", { count: item.node.paper_count ?? item.degree })}
          </div>
        </button>
      ))}
    </DecisionSection>
  );
}

function RelatedClusters({
  clusters,
  onSelectNode,
}: {
  clusters: ClusterSignal[];
  onSelectNode: (id: string) => void;
}) {
  const t = useT();
  return (
    <DecisionSection icon={<Network className="h-3.5 w-3.5" />} title={t("graph.clusters")}>
      {clusters.length === 0 ? <EmptyLine text={t("graph.noClusters")} /> : clusters.map((cluster) => (
        <div key={cluster.id} className="rounded-md border border-litera-line px-2.5 py-2">
          <div className="text-[11px] text-litera-mute mb-1">
            {t("graph.clusterMeta", { papers: cluster.nodes.length, links: cluster.edgeCount })}
          </div>
          <div className="space-y-1">
            {cluster.nodes.slice(0, 3).map((node) => (
              <button
                key={node.id}
                onClick={() => onSelectNode(node.id)}
                className="block w-full truncate text-left text-xs text-litera-text hover:text-litera-accent"
              >
                {node.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </DecisionSection>
  );
}

function EvidenceChains({
  edges,
  nodes,
}: {
  edges: GraphEdge[];
  nodes: GraphNode[];
}) {
  const t = useT();
  const [projectId, setProjectId] = useState<number | "">("");
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const projects = useQuery({ queryKey: ["projects"], queryFn: api.projectsList });
  const saveEvidence = useMutation({
    mutationFn: (edge: GraphEdge) => {
      if (projectId === "") throw new Error("Project is required");
      return api.evidenceAdd(projectId, edgeToEvidenceDraft(edge, nodeById));
    },
  });

  return (
    <DecisionSection icon={<Link2 className="h-3.5 w-3.5" />} title={t("graph.evidenceChains")}>
      {projects.data && projects.data.length > 0 && (
        <select
          value={projectId}
          onChange={(event) => setProjectId(event.target.value ? Number(event.target.value) : "")}
          className="litera-input mb-2 w-full py-1 text-xs"
        >
          <option value="">{t("common.none")}</option>
          {projects.data.map((project) => (
            <option key={project.id} value={project.id}>{project.name}</option>
          ))}
        </select>
      )}
      {edges.length === 0 ? <EmptyLine text={t("graph.noEvidenceChains")} /> : edges.map((edge) => (
        <div key={edge.id} className="rounded-md border border-litera-line px-2.5 py-2">
          <div className="text-xs text-litera-text line-clamp-2">
            {nodeById.get(edge.source)?.label ?? edge.source} {"->"} {nodeById.get(edge.target)?.label ?? edge.target}
          </div>
          <p className="mt-1 text-[11px] text-litera-mute line-clamp-3">{edge.snippet}</p>
          <button
            onClick={() => saveEvidence.mutate(edge)}
            disabled={saveEvidence.isPending || projectId === ""}
            className="mt-2 inline-flex items-center gap-1 text-[11px] text-litera-accent disabled:opacity-50"
          >
            {saveEvidence.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            {t("graph.addEvidence")}
          </button>
        </div>
      ))}
      {saveEvidence.error && (
        <div className="text-[11px] text-red-400/90">{(saveEvidence.error as Error).message}</div>
      )}
    </DecisionSection>
  );
}

function PaperActionRow({
  item,
  onSelectNode,
}: {
  item: PaperSignal;
  onSelectNode: (id: string) => void;
}) {
  const t = useT();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [projectId, setProjectId] = useState<number | "">("");
  const projects = useQuery({ queryKey: ["projects"], queryFn: api.projectsList });
  const queue = useMutation({
    mutationFn: () => api.queueAdd(item.node.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["queue"] }),
  });
  const addProject = useMutation({
    mutationFn: () => {
      if (projectId === "") throw new Error("Project is required");
      return api.projectAddPaper(projectId, item.node.id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });

  return (
    <div className="rounded-md border border-litera-line px-2.5 py-2">
      <button
        onClick={() => onSelectNode(item.node.id)}
        className="block w-full truncate text-left text-xs text-litera-text hover:text-litera-accent"
      >
        {item.node.label}
      </button>
      <div className="mt-1 text-[11px] text-litera-mute">
        {t("graph.linkDegree", { count: item.degree })}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <button onClick={() => navigate(`/reader/${item.node.id}`)} className="litera-btn text-[11px] px-2 py-0.5">
          <BookOpen className="h-3 w-3" />
          {t("common.read")}
        </button>
        <button
          onClick={() => queue.mutate()}
          disabled={queue.isPending}
          className="litera-btn text-[11px] px-2 py-0.5 disabled:opacity-50"
        >
          {queue.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ListPlus className="h-3 w-3" />}
          {t("graph.queue")}
        </button>
      </div>
      {projects.data && projects.data.length > 0 && (
        <div className="mt-2 flex items-center gap-1.5">
          <select
            value={projectId}
            onChange={(event) => setProjectId(event.target.value ? Number(event.target.value) : "")}
            className="litera-input min-w-0 flex-1 py-0.5 text-[11px]"
          >
            <option value="">{t("common.none")}</option>
            {projects.data.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
          <button
            onClick={() => addProject.mutate()}
            disabled={addProject.isPending || projectId === ""}
            className="text-litera-accent disabled:opacity-50"
            title={t("graph.addToProject")}
          >
            {addProject.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          </button>
        </div>
      )}
      {(queue.error || addProject.error) && (
        <div className="mt-1 text-[11px] text-red-400/90">{((queue.error ?? addProject.error) as Error).message}</div>
      )}
    </div>
  );
}

function DecisionSection({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-litera-mute">
        {icon}
        {title}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <div className="rounded-md border border-litera-line px-2.5 py-2 text-xs text-litera-mute">{text}</div>;
}
