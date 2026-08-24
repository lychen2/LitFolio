import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { GraphData, GraphNode } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";

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
  const t = useT();
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
      <div className="flex h-full items-center justify-center px-8 text-center text-sm text-litera-mute">
        {t("graph.noConcepts")}
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
          className="litera-input text-xs shadow-sm"
        >
          {concepts.map((c) => (
            <option key={c.id} value={c.label}>
              {c.label} ({c.paper_count ?? 0})
            </option>
          ))}
        </select>
      </div>

      <svg width={width} height={height} className="absolute inset-0">
        {lines.map((l, i) => (
          <line
            key={i}
            x1={l.x1}
            y1={l.y1}
            x2={l.x2}
            y2={l.y2}
            stroke={l.ring === 1 ? "var(--litera-info)" : "var(--litera-border-strong)"}
            strokeOpacity={l.ring === 1 ? 0.55 : 0.42}
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
                  className="flex h-14 w-14 items-center justify-center bg-litera-info text-xs font-semibold text-litera-ink shadow-lg transition-shadow group-hover:shadow-xl"
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
                  className="relative flex h-10 w-8 items-center justify-center rounded bg-litera-accent text-[10px] font-medium text-litera-ink shadow-md transition-transform duration-150 group-hover:scale-105"
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
                    transition-colors group-hover:text-litera-accent"
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
                  className="flex h-8 w-8 items-center justify-center bg-litera-info text-[10px] font-medium text-litera-ink shadow-md transition-transform duration-150 group-hover:scale-105"
                  style={{ clipPath: "polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)" }}
                />
                <span
                  className="mt-1 text-center leading-tight text-litera-text text-[10px] max-w-[90px] truncate
                    transition-colors group-hover:text-litera-success"
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
