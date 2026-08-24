import type { GraphEdge, GraphNode } from "@/lib/api";

interface GraphPalette {
  paper: string;
  concept: string;
  info: string;
  warning: string;
  text: string;
  surface: string;
  border: string;
}

let paletteCache: { theme: string; value: GraphPalette } | null = null;

function graphPalette(): GraphPalette {
  const theme = typeof document === "undefined" ? "fallback" : document.documentElement.dataset.theme ?? "violet";
  if (paletteCache?.theme === theme) return paletteCache.value;
  const styles = typeof document === "undefined" ? null : getComputedStyle(document.documentElement);
  const read = (token: string, fallback: string) => styles?.getPropertyValue(token).trim() || fallback;
  const value = {
    paper: read("--litera-accent", "#9b87d8"),
    concept: read("--litera-info", "#65b8c9"),
    info: read("--litera-accent2", "#65b8c9"),
    warning: read("--litera-warn", "#d7ad58"),
    text: read("--litera-text", "#e6e3ec"),
    surface: read("--litera-surface-3", "#302e39"),
    border: read("--litera-border-strong", "#5a5668"),
  };
  paletteCache = { theme, value };
  return value;
}

type PositionedNode = GraphNode & { x: number; y: number };
type PositionedLink = GraphEdge & { source: unknown; target: unknown };

export function drawGraphNode({
  node,
  ctx,
  globalScale,
  selectedNodeId,
  showLabel,
}: {
  node: PositionedNode;
  ctx: CanvasRenderingContext2D;
  globalScale: number;
  selectedNodeId: string | null;
  showLabel: boolean;
}) {
  if (!isFinite(node.x) || !isFinite(node.y)) return;
  const isPaper = node.node_type === "paper";
  if (node.id === selectedNodeId) {
    drawSelection({ node, ctx, isPaper });
  }
  isPaper ? drawPaperNode(node.x, node.y, ctx) : drawConceptNode(node.x, node.y, ctx);
  if (showLabel) {
    drawNodeLabel({ node, ctx, globalScale, isPaper });
  }
}

export function drawGraphLink({
  link,
  ctx,
  showArrowhead,
}: {
  link: PositionedLink;
  ctx: CanvasRenderingContext2D;
  showArrowhead: boolean;
}) {
  const src = typeof link.source === "object" ? link.source as PositionedNode : null;
  const tgt = typeof link.target === "object" ? link.target as PositionedNode : null;
  if (!src || !tgt || !isFinite(src.x) || !isFinite(src.y) || !isFinite(tgt.x) || !isFinite(tgt.y)) return;

  const geometry = linkGeometry(src, tgt);
  if (!geometry) return;
  const palette = graphPalette();
  const color = {
    citation: palette.info,
    similar: palette.paper,
    manual: palette.warning,
    concept: palette.concept,
  }[link.edge_type] ?? palette.border;
  drawEdgePath(ctx, geometry, color, link.source_type === "ai");
  if (showArrowhead) {
    drawArrowhead(ctx, geometry, color);
  }
}

function drawPaperNode(x: number, y: number, ctx: CanvasRenderingContext2D) {
  const box = { w: 14, h: 10, r: 2.5, lx: x - 7, ly: y - 5 };
  const palette = graphPalette();
  ctx.save();
  ctx.shadowColor = palette.paper;
  ctx.shadowBlur = 5;
  roundedRect(ctx, box);
  ctx.fillStyle = palette.paper;
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = palette.text;
  ctx.globalAlpha = 0.28;
  ctx.lineWidth = 0.5;
  ctx.stroke();
  ctx.globalAlpha = 1;
  drawFoldedCorner(ctx, box);
}

function drawConceptNode(x: number, y: number, ctx: CanvasRenderingContext2D) {
  const r = 7;
  const palette = graphPalette();
  ctx.save();
  ctx.shadowColor = palette.concept;
  ctx.shadowBlur = 5;
  hexagon(ctx, x, y, r);
  ctx.fillStyle = palette.concept;
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = palette.text;
  ctx.globalAlpha = 0.28;
  ctx.lineWidth = 0.5;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawSelection({
  node,
  ctx,
  isPaper,
}: {
  node: PositionedNode;
  ctx: CanvasRenderingContext2D;
  isPaper: boolean;
}) {
  const palette = graphPalette();
  const color = isPaper ? palette.paper : palette.concept;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.arc(node.x, node.y, isPaper ? 11 : 10, 0, 2 * Math.PI);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.15;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function drawNodeLabel({
  node,
  ctx,
  globalScale,
  isPaper,
}: {
  node: PositionedNode;
  ctx: CanvasRenderingContext2D;
  globalScale: number;
  isPaper: boolean;
}) {
  const fontSize = Math.max(3.5, 10 / globalScale);
  ctx.font = `500 ${fontSize}px system-ui, -apple-system, sans-serif`;
  const label = node.label.length > 22 ? `${node.label.slice(0, 20)}…` : node.label;
  const labelY = node.y + (isPaper ? 10 : 11);
  drawLabelPill({ ctx, x: node.x, y: labelY, width: ctx.measureText(label).width, fontSize });
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = graphPalette().text;
  ctx.fillText(label, node.x, labelY);
}

function drawLabelPill({
  ctx,
  x,
  y,
  width,
  fontSize,
}: {
  ctx: CanvasRenderingContext2D;
  x: number;
  y: number;
  width: number;
  fontSize: number;
}) {
  const pad = 2.5;
  const h = fontSize + pad * 2;
  const w = width + pad * 2.5;
  ctx.save();
  ctx.fillStyle = graphPalette().surface;
  ctx.globalAlpha = 0.82;
  roundedRect(ctx, { w, h, r: h / 2, lx: x - w / 2, ly: y - pad });
  ctx.fill();
  ctx.restore();
}

function linkGeometry(src: PositionedNode, tgt: PositionedNode) {
  const dx = tgt.x - src.x;
  const dy = tgt.y - src.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return null;
  const ux = dx / len;
  const uy = dy / len;
  const x1 = src.x + ux * 8;
  const y1 = src.y + uy * 8;
  const x2 = tgt.x - ux * 8;
  const y2 = tgt.y - uy * 8;
  return { x1, y1, x2, y2, cpx: (x1 + x2) / 2 - uy * 8, cpy: (y1 + y2) / 2 + ux * 8 };
}

function drawEdgePath(
  ctx: CanvasRenderingContext2D,
  geometry: NonNullable<ReturnType<typeof linkGeometry>>,
  color: string,
  aiSource: boolean,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = aiSource ? 1 : 1.5;
  ctx.globalAlpha = aiSource ? 0.6 : 0.8;
  ctx.setLineDash(aiSource ? [4, 4] : []);
  ctx.beginPath();
  ctx.moveTo(geometry.x1, geometry.y1);
  ctx.quadraticCurveTo(geometry.cpx, geometry.cpy, geometry.x2, geometry.y2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  geometry: NonNullable<ReturnType<typeof linkGeometry>>,
  color: string,
) {
  const tanX = geometry.x2 - geometry.cpx;
  const tanY = geometry.y2 - geometry.cpy;
  const tanLen = Math.sqrt(tanX * tanX + tanY * tanY);
  if (tanLen < 0.1) return;
  const tux = tanX / tanLen;
  const tuy = tanY / tanLen;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(geometry.x2, geometry.y2);
  ctx.lineTo(geometry.x2 - tux * 5 + tuy * 2.5, geometry.y2 - tuy * 5 - tux * 2.5);
  ctx.lineTo(geometry.x2 - tux * 5 - tuy * 2.5, geometry.y2 - tuy * 5 + tux * 2.5);
  ctx.closePath();
  ctx.fill();
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  box: { w: number; h: number; r: number; lx: number; ly: number },
) {
  ctx.beginPath();
  ctx.moveTo(box.lx + box.r, box.ly);
  ctx.lineTo(box.lx + box.w - box.r, box.ly);
  ctx.quadraticCurveTo(box.lx + box.w, box.ly, box.lx + box.w, box.ly + box.r);
  ctx.lineTo(box.lx + box.w, box.ly + box.h - box.r);
  ctx.quadraticCurveTo(box.lx + box.w, box.ly + box.h, box.lx + box.w - box.r, box.ly + box.h);
  ctx.lineTo(box.lx + box.r, box.ly + box.h);
  ctx.quadraticCurveTo(box.lx, box.ly + box.h, box.lx, box.ly + box.h - box.r);
  ctx.lineTo(box.lx, box.ly + box.r);
  ctx.quadraticCurveTo(box.lx, box.ly, box.lx + box.r, box.ly);
  ctx.closePath();
}

function drawFoldedCorner(
  ctx: CanvasRenderingContext2D,
  box: { w: number; h: number; lx: number; ly: number },
) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(box.lx + box.w - 3.5, box.ly);
  ctx.lineTo(box.lx + box.w, box.ly + 3.5);
  ctx.lineTo(box.lx + box.w - 3.5, box.ly + 3.5);
  ctx.closePath();
  ctx.fillStyle = graphPalette().text;
  ctx.globalAlpha = 0.22;
  ctx.fill();
  ctx.restore();
}

function hexagon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = -Math.PI / 6 + (2 * Math.PI * i) / 6;
    const px = x + r * Math.cos(angle);
    const py = y + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}
