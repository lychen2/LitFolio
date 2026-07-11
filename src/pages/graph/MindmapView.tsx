import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { GraphData, GraphNode } from "@/lib/api";

interface Props {
  data: GraphData;
  centerConcept: string | null;
  onSelectNode: (id: string | null) => void;
  width: number;
  height: number;
}

interface PositionedNode {
  node: GraphNode;
  x: number;
  y: number;
  ring: number;
}

export function MindmapView({ data, centerConcept, onSelectNode, width, height }: Props) {
  const navigate = useNavigate();
  const cx = width / 2;
  const cy = height / 2;

  const concepts = useMemo(
    () => data.nodes.filter((n) => n.node_type === "concept"),
    [data.nodes],
  );

  const activeConcept = centerConcept ?? concepts[0]?.label ?? null;

  const { positioned, lines } = useMemo(() => {
    if (!activeConcept) return { positioned: [], lines: [] };

    const conceptId = `concept:${activeConcept}`;
    const conceptNode = data.nodes.find((n) => n.id === conceptId);
    if (!conceptNode) return { positioned: [], lines: [] };

    const pos: PositionedNode[] = [{ node: conceptNode, x: cx, y: cy, ring: 0 }];
    const lineData: { x1: number; y1: number; x2: number; y2: number; ring: number }[] = [];

    const paperEdges = data.edges.filter(
      (e) => e.target === conceptId && e.edge_type === "concept",
    );
    const ring1Ids = new Set(paperEdges.map((e) => e.source));
    const ring1Nodes = data.nodes.filter((n) => ring1Ids.has(n.id));
    const r1 = Math.min(140, Math.max(80, ring1Nodes.length * 15));

    ring1Nodes.forEach((n, i) => {
      const angle = (2 * Math.PI * i) / ring1Nodes.length - Math.PI / 2;
      const x = cx + r1 * Math.cos(angle);
      const y = cy + r1 * Math.sin(angle);
      pos.push({ node: n, x, y, ring: 1 });
      lineData.push({ x1: cx, y1: cy, x2: x, y2: y, ring: 1 });
    });

    const ring2Edges = data.edges.filter(
      (e) =>
        ring1Ids.has(e.source) &&
        !ring1Ids.has(e.target) &&
        e.target !== conceptId &&
        e.edge_type !== "concept",
    );
    const ring2Ids = new Set(ring2Edges.map((e) => e.target));
    const ring2Nodes = data.nodes.filter((n) => ring2Ids.has(n.id));
    const r2 = r1 + 100;

    ring2Nodes.forEach((n, i) => {
      const parentEdge = ring2Edges.find((e) => e.target === n.id);
      const parentPos = pos.find((p) => p.node.id === parentEdge?.source);
      const baseAngle = parentPos
        ? Math.atan2(parentPos.y - cy, parentPos.x - cx)
        : (2 * Math.PI * i) / ring2Nodes.length;
      const spread = 0.3;
      const angle = baseAngle + spread * (i - ring2Nodes.length / 2);
      const x = cx + r2 * Math.cos(angle);
      const y = cy + r2 * Math.sin(angle);
      pos.push({ node: n, x, y, ring: 2 });
      if (parentPos) {
        lineData.push({ x1: parentPos.x, y1: parentPos.y, x2: x, y2: y, ring: 2 });
      }
    });

    return { positioned: pos, lines: lineData };
  }, [data, activeConcept, cx, cy]);

  if (concepts.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-litera-mute">
        No concept nodes available. Extract terms from papers first.
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Concept selector */}
      <div className="absolute top-3 left-3 z-10">
        <select
          value={activeConcept ?? ""}
          onChange={(e) => onSelectNode(e.target.value ? `concept:${e.target.value}` : null)}
          className="rounded-md border border-litera-line bg-litera-paper px-2.5 py-1.5 text-xs shadow-sm"
        >
          {concepts.map((c) => (
            <option key={c.id} value={c.label}>
              {c.label} ({c.paper_count ?? 0})
            </option>
          ))}
        </select>
      </div>

      <svg width={width} height={height} className="absolute inset-0">
        <defs>
          <linearGradient id="ring1-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#059669" stopOpacity="0.5" />
          </linearGradient>
          <linearGradient id="ring2-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#9ca3af" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#6b7280" stopOpacity="0.3" />
          </linearGradient>
        </defs>
        {lines.map((l, i) => (
          <line
            key={i}
            x1={l.x1}
            y1={l.y1}
            x2={l.x2}
            y2={l.y2}
            stroke={l.ring === 1 ? "url(#ring1-grad)" : "url(#ring2-grad)"}
            strokeWidth={l.ring === 1 ? 2 : 1}
            strokeDasharray={l.ring === 2 ? "5 5" : "none"}
            strokeLinecap="round"
          />
        ))}
      </svg>

      {positioned.map((p) => {
        const isCenter = p.ring === 0;
        const isPaper = p.node.node_type === "paper";
        return (
          <div
            key={p.node.id}
            className="absolute flex flex-col items-center cursor-pointer group"
            style={{
              left: p.x,
              top: p.y,
              transform: "translate(-50%, -50%)",
            }}
            onClick={() => {
              if (isPaper) navigate(`/reader/${p.node.id}`);
              else onSelectNode(p.node.id);
            }}
          >
            {isCenter ? (
              // Center concept: large hexagon-ish glow
              <div className="relative flex flex-col items-center">
                <div
                  className="h-14 w-14 rounded-xl flex items-center justify-center text-white text-xs font-semibold
                    bg-gradient-to-br from-emerald-400 to-emerald-600
                    shadow-[0_0_20px_rgba(5,150,105,0.4)] transition-shadow group-hover:shadow-[0_0_28px_rgba(5,150,105,0.6)]"
                  style={{ clipPath: "polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)" }}
                >
                  {p.node.label.slice(0, 4)}
                </div>
                <span className="mt-1.5 text-xs font-semibold text-litera-text max-w-[120px] truncate text-center">
                  {p.node.label}
                </span>
              </div>
            ) : isPaper ? (
              // Paper node: rounded-rect document shape
              <div className="flex flex-col items-center">
                <div
                  className="relative h-10 w-8 rounded-md flex items-center justify-center text-white text-[10px] font-medium
                    bg-gradient-to-br from-indigo-400 to-indigo-600
                    shadow-md transition-all duration-150 group-hover:scale-110 group-hover:shadow-lg"
                >
                  {/* Folded corner */}
                  <div
                    className="absolute top-0 right-0 w-0 h-0"
                    style={{
                      borderLeft: "6px solid transparent",
                      borderTop: "6px solid rgba(255,255,255,0.25)",
                    }}
                  />
                  {p.node.label.slice(0, 2)}
                </div>
                <span
                  className="mt-1 text-center leading-tight text-litera-text text-[10px] max-w-[90px] truncate
                    transition-colors group-hover:text-indigo-500"
                  title={p.node.label}
                >
                  {p.node.label}
                </span>
                {p.node.sublabel && (
                  <span className="text-[9px] text-litera-mute">{p.node.sublabel}</span>
                )}
              </div>
            ) : (
              // Concept node (non-center): hexagon
              <div className="flex flex-col items-center">
                <div
                  className="h-8 w-8 flex items-center justify-center text-white text-[10px] font-medium
                    bg-gradient-to-br from-emerald-400 to-emerald-600
                    shadow-md transition-all duration-150 group-hover:scale-110 group-hover:shadow-lg"
                  style={{ clipPath: "polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)" }}
                />
                <span
                  className="mt-1 text-center leading-tight text-litera-text text-[10px] max-w-[90px] truncate
                    transition-colors group-hover:text-emerald-600"
                  title={p.node.label}
                >
                  {p.node.label}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
