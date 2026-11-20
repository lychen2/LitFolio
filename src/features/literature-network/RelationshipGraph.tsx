import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Minus, Plus } from "@/components/icons";
import { Button, IconButton } from "@/components/ui";
import { formatMessage } from "@/i18n/format";
import type { NetworkCopy } from "./copy";
import type { LiteratureNetwork, LiteratureNetworkEdge, LiteratureNetworkNode } from "./network";
import { createRelationshipLayout, createRelationshipRoutes, groupRelationships, relationshipPath } from "./relationshipLayout";
import type { Point, PositionedPaper, RelationshipPair } from "./relationshipLayout";
import { useGraphGestures } from "./useGraphGestures";
import { useRelationshipPositions } from "./useRelationshipPositions";
import "./RelationshipGraph.css";

const YEAR_COLORS = ["var(--network-year-old)", "var(--network-year-middle)", "var(--network-year-new)"];

interface LabelBox extends Point {
  width: number;
  height: number;
}

function placeLabels(
  papers: readonly LiteratureNetworkNode[],
  marks: ReadonlyMap<string, Point & { radius: number }>,
  priority: ReadonlySet<string>,
  activeId: string | null,
  budget: number,
  overviewBounds: { width: number; height: number } | null,
) {
  const occupied: LabelBox[] = [];
  const labels = new Map<string, LabelBox>();
  const overlaps = (label: LabelBox, box: LabelBox) => label.x < box.x + box.width + 2 && label.x + label.width + 2 > box.x
    && label.y < box.y + box.height + 2 && label.y + label.height + 2 > box.y;
  const ranked = [...papers].sort((a, b) => {
    function rank(node: LiteratureNetworkNode) {
      if (node.id === activeId) return 3;
      if (node.isSeed) return 2;
      return Number(priority.has(node.id));
    }
    return rank(b) - rank(a) || (b.citationCount ?? 0) - (a.citationCount ?? 0);
  });
  for (const { x, y, radius } of marks.values()) {
    const r = radius + 4;
    occupied.push({ x: x - r, y: y - r, width: 2 * r, height: 2 * r });
  }
  for (const paper of ranked) {
    if (labels.size >= budget) break;
    const mark = marks.get(paper.id);
    if (!mark) continue;
    const { x, y, radius } = mark;
    const labelWidth = Math.min(164, Math.max(52, paper.title.length * 8 + 14));
    const labelHeight = 34;
    const candidates = [
      { x: x - labelWidth / 2, y: y + radius + 7 },
      { x: x - labelWidth / 2, y: y - radius - 7 - labelHeight },
      { x: x + radius + 8, y: y - labelHeight / 2 },
      { x: x - radius - 8 - labelWidth, y: y - labelHeight / 2 },
      { x: x + radius + 6, y: y + radius + 5 },
      { x: x - radius - 6 - labelWidth, y: y + radius + 5 },
      { x: x + radius + 6, y: y - radius - 5 - labelHeight },
      { x: x - radius - 6 - labelWidth, y: y - radius - 5 - labelHeight },
    ];
    const available = overviewBounds ? candidates.filter((candidate) => (
      candidate.x >= 6 - overviewBounds.width / 2 && candidate.x + labelWidth <= overviewBounds.width / 2 - 6
      && candidate.y >= 6 - overviewBounds.height / 2 && candidate.y + labelHeight <= overviewBounds.height / 2 - 6
    )) : candidates;
    const required = paper.id === activeId || paper.isSeed || papers.length <= 4;
    const point = available.find((candidate) => {
      const box = { ...candidate, width: labelWidth, height: labelHeight };
      return !occupied.some((other) => overlaps(box, other));
    }) ?? (required ? available[0] ?? candidates[0] : undefined);
    if (point) {
      const box = { ...point, width: labelWidth, height: labelHeight };
      occupied.push(box);
      labels.set(paper.id, box);
    }
  }
  return labels;
}

export function relationshipLabels(pair: RelationshipPair, copy: NetworkCopy, fromId?: string) {
  return [...new Set(pair.edges.map((edge) => fromId && edge.kind === "citation"
    ? edge.source === fromId ? copy.cites : copy.citedBy
    : relationshipLabel(edge, copy)))].join(" · ");
}

export function relationshipLabel(edge: LiteratureNetworkEdge, copy: NetworkCopy) {
  if (edge.kind === "citation") return copy.directCitation;
  if (edge.kind === "co_citation") return copy.coCitation;
  return copy.sharedReferences;
}

export function RelationshipGraph({ result, visibleIds, papers, pairs, selectedId, selectedPairId, copy, onSelectPaper, onSelectPair }: {
  result: LiteratureNetwork;
  visibleIds: ReadonlySet<string>;
  papers: LiteratureNetworkNode[];
  pairs: RelationshipPair[];
  selectedId: string | null;
  selectedPairId: string | null;
  copy: NetworkCopy;
  onSelectPaper: (node: LiteratureNetworkNode) => void;
  onSelectPair: (pair: RelationshipPair) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const camera = useRef<SVGGElement>(null);
  const edgeTargets = useRef(new Map<string, SVGPathElement>());
  const edgeLines = useRef(new Map<string, SVGPathElement>());
  const paperNodes = useRef(new Map<string, SVGGElement>());
  const paintEdges = useRef<((points: readonly PositionedPaper[]) => void) | null>(null);
  const arrowId = useId();
  const keysId = useId();
  const [size, setSize] = useState({ width: 720, height: 400 });
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [focusedEdge, setFocusedEdge] = useState<string | null>(null);
  const [edgeTab, setEdgeTab] = useState<string | null>(null);
  const edgeHover = useRef<string | null>(null);
  const { width, height } = size;

  useEffect(() => {
    const target = svg.current;
    if (!target) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width: w, height: h } = entry.contentRect;
      if (w > 0 && h > 0) setSize({ width: w, height: h });
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  const maxCitations = useMemo(() => Math.max(0, ...result.nodes.map((node) => node.citationCount ?? 0)), [result.nodes]);
  // The result identity is stable when titles change. Geometry depends only on the original topology.
  const originalPapers = useMemo(() => result.nodes.filter((node) => visibleIds.has(node.id)), [result.nodes, visibleIds]);
  const originalEdges = useMemo(() => result.edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target)), [result.edges, visibleIds]);
  const originalPairs = useMemo(() => groupRelationships(originalEdges), [originalEdges]);
  const layout = useMemo(() => createRelationshipLayout(originalPapers, originalPairs, maxCitations), [originalPapers, originalPairs, maxCitations]);
  const { labelAnchors, moved, livePoints, paint, controls } = useRelationshipPositions(layout);
  const fit = Math.min(1, Math.max(1, width - 80) / layout.width, Math.max(1, height - 84) / layout.height);
  const { zoom, dragging, begin, move, end, cancelDragClick, zoomBy, bringIntoView, reset, canZoomOut, canZoomIn, changed } = useGraphGestures(
    svg, camera, size, fit, (id, position) => controls.current?.drag(id, position),
  );
  function resetGraph() {
    reset();
    controls.current?.reset();
  }
  const routes = useMemo(() => createRelationshipRoutes(originalPairs, layout.points), [originalPairs, layout.points]);
  const routesByPair = useMemo(() => {
    const grouped = new Map<string, typeof routes>();
    for (const route of routes) {
      const group = grouped.get(route.pairId);
      if (group) group.push(route);
      else grouped.set(route.pairId, [route]);
    }
    return grouped;
  }, [routes]);
  const displayNodes = useMemo(() => new Map(papers.map((paper) => [paper.id, paper])), [papers]);
  const scale = fit * zoom;

  useLayoutEffect(() => {
    // Paths live in world coordinates. Camera zoom only changes their enclosing transform.
    function drawEdges(points: readonly PositionedPaper[]) {
      for (const [id, group] of routesByPair) {
        let combined = "";
        for (const route of group) {
          const path = relationshipPath(route, points);
          edgeLines.current.get(route.id)?.setAttribute("d", path);
          if (path) combined += ` ${path}`;
        }
        edgeTargets.current.get(id)?.setAttribute("d", combined);
      }
    }
    paintEdges.current = drawEdges;
    drawEdges(livePoints.current);
    return () => { paintEdges.current = null; };
  }, [livePoints, routesByPair]);

  useLayoutEffect(() => {
    function drawPapers(points: readonly PositionedPaper[]) {
      for (const point of points) {
        paperNodes.current.get(point.id)?.setAttribute("transform", `translate(${point.x * scale} ${point.y * scale})`);
      }
    }
    // React owns the interactive elements. Animation only changes their geometry.
    paint.current = (points) => {
      drawPapers(points);
      paintEdges.current?.(points);
    };
    drawPapers(livePoints.current);
    return () => { paint.current = null; };
  }, [layout.points, livePoints, paint, scale]);

  const years = result.nodes.flatMap(({ year }) => year === null ? [] : [year]);
  const lastYear = Math.max(...years);
  const span = years.length ? Math.max(3, lastYear - Math.min(...years) + 1) : 0;
  const firstYear = lastYear - span + 1;
  const bands = copy.periods.map((label, index) => ({
    start: firstYear + Math.ceil(index * span / 3),
    end: firstYear + Math.ceil((index + 1) * span / 3) - 1,
    label,
    color: YEAR_COLORS[index],
    count: 0,
  }));
  const bandFor = (year: number) => bands[Math.floor((year - firstYear) * 3 / span)];
  let unknownYearCount = 0;
  for (const { year } of originalPapers) {
    if (year === null) unknownYearCount++;
    else bandFor(year).count++;
  }
  const yearColor = (year: number) => bandFor(year).color;

  const selectedPair = pairs.find(({ id }) => id === selectedPairId);
  const neighbors = useMemo(() => {
    const ids = new Set<string>();
    const pair = originalPairs.find(({ id }) => id === selectedPairId);
    if (pair) {
      ids.add(pair.source);
      ids.add(pair.target);
    } else if (selectedId) {
      ids.add(selectedId);
      for (const { source, target } of originalPairs) {
        if (source === selectedId) ids.add(target);
        if (target === selectedId) ids.add(source);
      }
    }
    return ids;
  }, [originalPairs, selectedId, selectedPairId]);
  const activeId = selectedId ?? focusedId;
  // Keep label offsets while nodes move; reflow at rest or at a discrete zoom level.
  const labelTier = zoom >= 3.375 ? 3.375 : zoom >= 2.25 ? 2.25 : zoom >= 1.5 ? 1.5 : 1;
  const labelScale = fit * labelTier;
  const labelBudget = papers.length <= 8 ? papers.length : labelTier === 1 ? 9 : labelTier === 1.5 ? 16 : papers.length;
  const labels = useMemo(() => {
    const anchors = new Map(labelAnchors.map(({ id, x, y, radius }) => [id, { x: x * labelScale, y: y * labelScale, radius: radius * labelScale }]));
    const placed = placeLabels(originalPapers, anchors, neighbors, activeId, labelBudget, labelTier === 1 ? { width, height } : null);
    for (const [id, box] of placed) {
      const anchor = anchors.get(id);
      if (anchor) {
        box.x -= anchor.x;
        box.y -= anchor.y;
      }
    }
    return placed;
  }, [labelAnchors, originalPapers, neighbors, activeId, labelBudget, labelScale, labelTier, width, height]);
  const tabbableEdgeId = edgeTab && routesByPair.has(edgeTab) ? edgeTab : pairs[0]?.id;

  function handleEdgeKey(event: KeyboardEvent<SVGPathElement>, pair: RelationshipPair) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelectPair(pair);
    } else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      const step = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
      const index = pairs.findIndex(({ id }) => id === pair.id);
      const next = pairs[(index + step + pairs.length) % pairs.length];
      edgeTargets.current.get(next.id)?.focus();
    }
  }

  const orderedRoutes = routes.map((route) => {
    const { source, target } = route.edge;
    const chosen = route.pairId === selectedPairId;
    const adjacent = !selectedPair && !!selectedId && (source === selectedId || target === selectedId);
    return { ...route, chosen, adjacent, focused: route.pairId === focusedEdge };
  }).sort((a, b) => Number(a.chosen || a.focused || a.adjacent) - Number(b.chosen || b.focused || b.adjacent));

  return (
    <div className="relationship-graph">
      <p className="sr-only" id={keysId}>{copy.graphKeys}</p>
      <div className="relationship-graph__viewport" data-dragging={dragging} data-dense={routes.length > 80} data-sparse={papers.length <= 4}>
        <svg ref={svg} className="relationship-graph__svg" viewBox={`0 0 ${width} ${height}`} aria-describedby={keysId}
          onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end} onClickCapture={cancelDragClick}>
          <defs>
            <marker id={arrowId} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto">
              <path d="M 0 0 L 8 4 L 0 8 L 2 4 Z" className="relationship-graph__arrow" />
            </marker>
          </defs>
          <rect width={width} height={height} className="relationship-graph__backdrop" onPointerDown={(event) => begin(event)} />
          <g ref={camera}>
            <g transform={`scale(${scale})`}>
              {orderedRoutes.map(({ id, edge, chosen, adjacent, focused }) => (
                <path key={id} ref={(target) => {
                  if (target) edgeLines.current.set(id, target);
                  else edgeLines.current.delete(id);
                }} className="relationship-graph__line" data-kind={edge.kind}
                  data-emphasis={chosen || focused ? "strong" : adjacent ? "neighbor" : neighbors.size > 0 ? "dim" : "normal"}
                  markerEnd={edge.kind === "citation" ? `url(#${arrowId})` : undefined} aria-hidden="true" />
              ))}
              {pairs.map((pair) => {
                const { id, source, target } = pair;
                if (!routesByPair.has(id)) return null;
                const label = formatMessage(copy.edgeLabel, {
                  source: displayNodes.get(source)?.title ?? source,
                  target: displayNodes.get(target)?.title ?? target,
                  relation: relationshipLabels(pair, copy),
                });
                return <path key={id} className="relationship-graph__edge-hit" role="button" tabIndex={id === tabbableEdgeId ? 0 : -1}
                  ref={(target) => {
                    if (target) edgeTargets.current.set(id, target);
                    else edgeTargets.current.delete(id);
                  }}
                  aria-label={label} aria-pressed={id === selectedPairId}
                  onFocus={(event) => {
                    const bounds = event.currentTarget.getBBox();
                    setEdgeTab(id);
                    setFocusedEdge(id);
                    bringIntoView({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 });
                  }}
                  onBlur={() => setFocusedEdge(edgeHover.current)}
                  onPointerEnter={() => { edgeHover.current = id; setFocusedEdge(id); }}
                  onPointerLeave={(event) => {
                    edgeHover.current = null;
                    if (document.activeElement !== event.currentTarget) setFocusedEdge(null);
                  }}
                  onPointerDown={(event) => begin(event)} onKeyDown={(event) => handleEdgeKey(event, pair)}
                  onClick={() => onSelectPair(pair)}><title>{label}</title></path>;
              })}
            </g>
            {layout.points.map((point, index) => {
              const paper = displayNodes.get(point.id);
              if (!paper) return null;
              const label = labels.get(point.id);
              const radius = Math.max(4, point.radius * scale);
              const chosen = point.id === selectedId && !selectedPair;
              const near = neighbors.has(point.id);
              const state = chosen ? "selected" : near ? "neighbor" : neighbors.size > 0 ? "dim" : "normal";
              const name = paper.isSeed ? formatMessage(copy.seedMarker, { title: paper.title }) : paper.title;
              return (
                <g key={point.id} className="relationship-graph__paper" data-state={state} role="button" tabIndex={0}
                  ref={(target) => {
                    if (target) paperNodes.current.set(point.id, target);
                    else paperNodes.current.delete(point.id);
                  }}
                  aria-label={name} aria-pressed={chosen}
                  onFocus={() => { setFocusedId(point.id); bringIntoView(livePoints.current[index]); }} onBlur={() => setFocusedId(null)}
                  onPointerDown={(event) => begin(event, { ...livePoints.current[index] })}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    onSelectPaper(paper);
                  }} onClick={() => onSelectPaper(paper)}>
                  <title>{paper.title}</title>
                  <circle r={Math.max(13, radius + 5)} fill="transparent" />
                  <circle r={radius + 5} className="relationship-graph__focus-ring" />
                  {paper.isSeed && <circle r={radius + 3} className="relationship-graph__seed-ring" />}
                  <circle r={radius} className="relationship-graph__mark" fill={paper.year === null ? "var(--network-year-unknown)" : yearColor(paper.year)} />
                  {label && <foreignObject {...label} aria-hidden="true"><div className="relationship-graph__label">{paper.title}</div></foreignObject>}
                </g>
              );
            })}
          </g>
        </svg>
        {!pairs.length && <p className="relationship-graph__empty">{copy.noEdges}</p>}
        <div className="relationship-graph__controls" role="group" aria-label={copy.graphControls}>
          <IconButton label={copy.zoomOut} disabled={!canZoomOut} onClick={() => zoomBy(1 / 1.5)}><Minus aria-hidden="true" /></IconButton>
          <output>{Math.round(zoom * 100)}%</output>
          <IconButton label={copy.zoomIn} disabled={!canZoomIn} onClick={() => zoomBy(1.5)}><Plus aria-hidden="true" /></IconButton>
          <Button size="sm" onClick={resetGraph} disabled={!changed && !moved}>{copy.resetView}</Button>
        </div>
      </div>
      <div className="relationship-graph__legend">
        <div className="relationship-graph__years" role="group" aria-label={copy.year}>
          <span>{copy.year}</span>
          {bands.map(({ start, end, color, count, label }) => (
            <span key={label} title={span ? `${start === end ? start : `${start}–${end}`} (${count})` : `${label} (0)`}>
              <i style={{ background: color }} />{label}
            </span>
          ))}
          {unknownYearCount > 0 && <span><i className="relationship-graph__unknown" />{copy.unknownYear} ({unknownYearCount})</span>}
        </div>
        <div>
          <span><i className="relationship-graph__seed-key" />{copy.seedLegend}</span>
          <span><i className="relationship-graph__related-key" />{copy.relatedLegend}</span>
          <span>{copy.sizeLegend}</span>
        </div>
        {pairs.length > 0 && <div>
          <span><i className="relationship-graph__edge-key" data-kind="citation" />{copy.directCitation}</span>
          <span><i className="relationship-graph__edge-key" data-kind="co_citation" />{copy.coCitation}</span>
          <span><i className="relationship-graph__edge-key" data-kind="shared_reference" />{copy.sharedReferences}</span>
        </div>}
      </div>
    </div>
  );
}
