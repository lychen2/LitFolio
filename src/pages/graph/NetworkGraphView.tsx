import { useRef, useCallback, useEffect } from "react";
import ForceGraph2D from "react-force-graph-2d";
import type { GraphData, GraphNode, GraphEdge } from "@/lib/api";

/** Paper node: warm indigo-blue */
const PAPER_COLOR = "#6366f1";
const PAPER_COLOR_LIGHT = "#818cf8";
/** Concept node: vibrant emerald */
const CONCEPT_COLOR = "#059669";
const CONCEPT_COLOR_LIGHT = "#34d399";

const EDGE_COLORS: Record<string, string> = {
  extends: "#a78bfa",
  contradicts: "#f87171",
  compares: "#fbbf24",
  builds_on: "#38bdf8",
  uses_method: "#2dd4bf",
  related: "#9ca3af",
  has_concept: "#6ee7b7",
  discusses: "#6ee7b7",
  replaces: "#f472b6",
  extends_concept: "#c084fc",
  requires: "#fb923c",
  enables: "#34d399",
  competes_with: "#ef4444",
};

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
      const timer = setTimeout(() => {
        fgRef.current?.zoomToFit(400, 40);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [data.nodes.length]);

  /** Draw a rounded-rect "document" shape for paper nodes */
  const drawPaperNode = useCallback(
    (x: number, y: number, ctx: CanvasRenderingContext2D) => {
      if (!isFinite(x) || !isFinite(y)) return;
      const w = 14;
      const h = 10;
      const r = 2.5;
      const lx = x - w / 2;
      const ly = y - h / 2;

      // Shadow
      ctx.save();
      ctx.shadowColor = "rgba(99, 102, 241, 0.35)";
      ctx.shadowBlur = 6;

      // Gradient fill
      const grad = ctx.createLinearGradient(lx, ly, lx + w, ly + h);
      grad.addColorStop(0, PAPER_COLOR_LIGHT);
      grad.addColorStop(1, PAPER_COLOR);

      ctx.beginPath();
      ctx.moveTo(lx + r, ly);
      ctx.lineTo(lx + w - r, ly);
      ctx.quadraticCurveTo(lx + w, ly, lx + w, ly + r);
      ctx.lineTo(lx + w, ly + h - r);
      ctx.quadraticCurveTo(lx + w, ly + h, lx + w - r, ly + h);
      ctx.lineTo(lx + r, ly + h);
      ctx.quadraticCurveTo(lx, ly + h, lx, ly + h - r);
      ctx.lineTo(lx, ly + r);
      ctx.quadraticCurveTo(lx, ly, lx + r, ly);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();

      // Subtle border
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Folded corner triangle
      ctx.beginPath();
      ctx.moveTo(lx + w - 3.5, ly);
      ctx.lineTo(lx + w, ly + 3.5);
      ctx.lineTo(lx + w - 3.5, ly + 3.5);
      ctx.closePath();
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.fill();
    },
    [],
  );

  /** Draw a hexagon for concept nodes */
  const drawConceptNode = useCallback(
    (x: number, y: number, ctx: CanvasRenderingContext2D) => {
      if (!isFinite(x) || !isFinite(y)) return;
      const r = 7;
      const sides = 6;
      const angleOffset = -Math.PI / 6;

      ctx.save();
      ctx.shadowColor = "rgba(5, 150, 105, 0.35)";
      ctx.shadowBlur = 6;

      const grad = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
      grad.addColorStop(0, CONCEPT_COLOR_LIGHT);
      grad.addColorStop(1, CONCEPT_COLOR);

      ctx.beginPath();
      for (let i = 0; i < sides; i++) {
        const angle = angleOffset + (2 * Math.PI * i) / sides;
        const px = x + r * Math.cos(angle);
        const py = y + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();

      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 0.5;
      ctx.stroke();
    },
    [],
  );

  const nodeCanvasObject = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const gn = node as GraphNode & { x: number; y: number };
      if (!isFinite(gn.x) || !isFinite(gn.y)) return;
      const isPaper = gn.node_type === "paper";
      const isSelected = gn.id === selectedNodeId;

      // Selection glow ring
      if (isSelected) {
        ctx.save();
        const glowColor = isPaper ? "rgba(99,102,241,0.4)" : "rgba(5,150,105,0.4)";
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(gn.x, gn.y, isPaper ? 11 : 10, 0, 2 * Math.PI);
        ctx.fillStyle = isPaper ? "rgba(99,102,241,0.15)" : "rgba(5,150,105,0.15)";
        ctx.fill();
        ctx.strokeStyle = isPaper ? PAPER_COLOR : CONCEPT_COLOR;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      }

      // Draw node shape
      if (isPaper) {
        drawPaperNode(gn.x, gn.y, ctx);
      } else {
        drawConceptNode(gn.x, gn.y, ctx);
      }

      // Label with background pill
      const fontSize = Math.max(3.5, 10 / globalScale);
      ctx.font = `500 ${fontSize}px system-ui, -apple-system, sans-serif`;
      const label = gn.label.length > 22 ? gn.label.slice(0, 20) + "…" : gn.label;
      const textWidth = ctx.measureText(label).width;
      const labelY = gn.y + (isPaper ? 10 : 11);

      // Background pill
      ctx.save();
      ctx.fillStyle = "rgba(15, 23, 42, 0.7)";
      const pillPad = 2.5;
      const pillH = fontSize + pillPad * 2;
      const pillW = textWidth + pillPad * 2.5;
      const pillR = pillH / 2;
      const pillX = gn.x - pillW / 2;
      const pillY = labelY - pillPad;
      ctx.beginPath();
      ctx.moveTo(pillX + pillR, pillY);
      ctx.lineTo(pillX + pillW - pillR, pillY);
      ctx.quadraticCurveTo(pillX + pillW, pillY, pillX + pillW, pillY + pillR);
      ctx.quadraticCurveTo(pillX + pillW, pillY + pillH, pillX + pillW - pillR, pillY + pillH);
      ctx.lineTo(pillX + pillR, pillY + pillH);
      ctx.quadraticCurveTo(pillX, pillY + pillH, pillX, pillY + pillR);
      ctx.quadraticCurveTo(pillX, pillY, pillX + pillR, pillY);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Label text
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = "#f1f5f9";
      ctx.fillText(label, gn.x, labelY);
    },
    [selectedNodeId, drawPaperNode, drawConceptNode],
  );

  const linkCanvasObject = useCallback(
    (link: any, ctx: CanvasRenderingContext2D) => {
      const ge = link as GraphEdge & { source: any; target: any };
      const src = typeof ge.source === "object" ? ge.source : null;
      const tgt = typeof ge.target === "object" ? ge.target : null;
      if (!src || !tgt || !isFinite(src.x) || !isFinite(src.y) || !isFinite(tgt.x) || !isFinite(tgt.y)) return;

      const color = EDGE_COLORS[ge.edge_type] ?? "#9ca3af";
      const dx = tgt.x - src.x;
      const dy = tgt.y - src.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1) return;

      // Offset endpoints to node boundary
      const nodeR = 8;
      const ux = dx / len;
      const uy = dy / len;
      const x1 = src.x + ux * nodeR;
      const y1 = src.y + uy * nodeR;
      const x2 = tgt.x - ux * nodeR;
      const y2 = tgt.y - uy * nodeR;

      // Subtle curve via quadratic bezier
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      const perpX = -uy * 8;
      const perpY = ux * 8;
      const cpx = midX + perpX;
      const cpy = midY + perpY;

      ctx.strokeStyle = color;
      ctx.lineWidth = ge.source_type === "ai" ? 1 : 1.5;
      ctx.globalAlpha = ge.source_type === "ai" ? 0.6 : 0.8;
      if (ge.source_type === "ai") {
        ctx.setLineDash([4, 4]);
      } else {
        ctx.setLineDash([]);
      }

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(cpx, cpy, x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // Arrowhead at target
      const arrowLen = 5;
      const arrowW = 2.5;
      // Tangent at end of quadratic curve
      const tanX = x2 - cpx;
      const tanY = y2 - cpy;
      const tanLen = Math.sqrt(tanX * tanX + tanY * tanY);
      if (tanLen < 0.1) return;
      const tux = tanX / tanLen;
      const tuy = tanY / tanLen;

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - tux * arrowLen + tuy * arrowW, y2 - tuy * arrowLen - tux * arrowW);
      ctx.lineTo(x2 - tux * arrowLen - tuy * arrowW, y2 - tuy * arrowLen + tux * arrowW);
      ctx.closePath();
      ctx.fill();
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
      d3AlphaDecay={0.02}
      d3VelocityDecay={0.3}
      warmupTicks={50}
      cooldownTicks={100}
      enableNodeDrag={true}
      enableZoomInteraction={true}
    />
  );
}
