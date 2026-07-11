import type { GraphEdge } from "@/lib/api";

export function paperLinkIdFromGraphEdge(edge: GraphEdge): number | null {
  const match = /^link:(\d+)$/.exec(edge.id);
  if (!match) return null;
  return Number(match[1]);
}
