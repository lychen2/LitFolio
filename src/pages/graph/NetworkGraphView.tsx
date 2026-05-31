import { useRef, useCallback, useEffect } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { forceCollide } from "d3-force-3d";
import type { GraphData, GraphNode, GraphEdge } from "@/lib/api";
import { drawGraphLink, drawGraphNode } from "./NetworkGraphCanvas";

interface Props {
  data: GraphData;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  width: number;
  height: number;
}

export function NetworkGraphView({ data, selectedNodeId, onSelectNode, width, height }: Props) {
  const fgRef = useRef<any>(null);

  useEffect(() => {
    if (fgRef.current && data.nodes.length > 0) {
      // Configure forces for stable, well-spaced layout
      const fg = fgRef.current;
      fg.d3Force("link")?.distance(150);
      fg.d3Force("charge")?.strength(-450).distanceMax(500);
      fg.d3Force("collide", forceCollide(30));
      const timer = setTimeout(() => {
        fg.zoomToFit(400, 60);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [data.nodes.length]);

  const nodeCanvasObject = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const gn = node as GraphNode & { x: number; y: number };
      drawGraphNode({ node: gn, ctx, globalScale, selectedNodeId });
    },
    [selectedNodeId],
  );

  const linkCanvasObject = useCallback(
    (link: any, ctx: CanvasRenderingContext2D) => {
      const ge = link as GraphEdge & { source: any; target: any };
      drawGraphLink({ link: ge, ctx });
    },
    [],
  );

  const handleNodeClick = useCallback(
    (node: any) => {
      onSelectNode((node as GraphNode).id);
    },
    [onSelectNode],
  );

  const handleBackgroundClick = useCallback(() => {
    onSelectNode(null);
  }, [onSelectNode]);

  if (data.nodes.length === 0) return null;

  return (
    <ForceGraph2D
      ref={fgRef}
      graphData={{ nodes: data.nodes as any, links: data.edges as any }}
      width={width}
      height={height}
      backgroundColor="rgba(0,0,0,0)"
      nodeCanvasObject={nodeCanvasObject}
      linkCanvasObject={linkCanvasObject}
      onNodeClick={handleNodeClick}
      onBackgroundClick={handleBackgroundClick}
      d3AlphaDecay={0.028}
      d3VelocityDecay={0.4}
      warmupTicks={100}
      cooldownTicks={300}
      enableNodeDrag={true}
      enableZoomInteraction={true}
    />
  );
}
