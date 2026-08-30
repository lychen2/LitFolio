import type { GraphData, GraphEdge, GraphNode } from "@/lib/api";

export interface PaperSignal {
  node: GraphNode;
  degree: number;
}

export interface ConceptSignal {
  node: GraphNode;
  degree: number;
}

export interface ClusterSignal {
  id: string;
  nodes: GraphNode[];
  edgeCount: number;
}

export function graphSignals(graphData: GraphData) {
  const degree = degreeMap(graphData.edges);
  const paperNodes = graphData.nodes.filter((node) => node.node_type === "paper");
  const conceptNodes = graphData.nodes.filter((node) => node.node_type === "concept");
  return {
    unreadCorePapers: topPaperSignals(paperNodes, degree),
    underCoveredConcepts: conceptNodes
      .map((node) => ({ node, degree: degree.get(node.id) ?? 0 }))
      .filter((item) => (item.node.paper_count ?? item.degree) <= 2)
      .sort((a, b) => b.degree - a.degree)
      .slice(0, 5),
    clusters: connectedClusters(paperNodes, graphData.edges).slice(0, 3),
    evidenceChains: graphData.edges.filter((edge) => edge.snippet?.trim()).slice(0, 5),
  };
}

function topPaperSignals(nodes: GraphNode[], degree: Map<string, number>) {
  return nodes
    .map((node) => ({ node, degree: degree.get(node.id) ?? 0 }))
    .filter((item) => item.node.read_status !== "read")
    .sort((a, b) => b.degree - a.degree)
    .slice(0, 5);
}

function degreeMap(edges: GraphEdge[]) {
  const degree = new Map<string, number>();
  for (const edge of edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }
  return degree;
}

function connectedClusters(nodes: GraphNode[], edges: GraphEdge[]): ClusterSignal[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const adjacency = buildAdjacency(edges, nodeById);
  const seen = new Set<string>();
  const clusters: ClusterSignal[] = [];
  for (const node of nodes) {
    if (seen.has(node.id)) continue;
    const ids = collectCluster(node.id, adjacency, seen);
    if (ids.length < 2) continue;
    clusters.push({
      id: ids.join(":"),
      nodes: ids.map((id) => nodeById.get(id)).filter((item): item is GraphNode => !!item),
      edgeCount: edges.filter((edge) => ids.includes(edge.source) && ids.includes(edge.target)).length,
    });
  }
  return clusters.sort((a, b) => b.edgeCount - a.edgeCount);
}

function buildAdjacency(edges: GraphEdge[], nodeById: Map<string, GraphNode>) {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) continue;
    adjacency.set(edge.source, [...(adjacency.get(edge.source) ?? []), edge.target]);
    adjacency.set(edge.target, [...(adjacency.get(edge.target) ?? []), edge.source]);
  }
  return adjacency;
}

function collectCluster(start: string, adjacency: Map<string, string[]>, seen: Set<string>) {
  const pending = [start];
  const ids: string[] = [];
  while (pending.length > 0) {
    const id = pending.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    pending.push(...(adjacency.get(id) ?? []));
  }
  return ids;
}
