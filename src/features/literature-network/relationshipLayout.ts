import type { LiteratureNetworkEdge, LiteratureNetworkNode } from "./network";

export interface Point {
  x: number;
  y: number;
}

export interface PositionedPaper extends Point {
  id: string;
  radius: number;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const MIN_TEMPERATURE = 0.035;

interface Spring {
  source: number;
  target: number;
  strength: number;
}

export interface RelationshipLayout {
  points: PositionedPaper[];
  width: number;
  height: number;
  spacing: number;
  springs: Spring[];
}

interface Particle extends PositionedPaper {
  vx: number;
  vy: number;
}

export interface RelationshipSimulation {
  layout: RelationshipLayout;
  points: Particle[];
  pinned: Particle | null;
  temperature: number;
}

export function networkEdgeId({ source, target, kind }: LiteratureNetworkEdge) {
  return JSON.stringify([source, target, kind]);
}

export function groupRelationships(edges: readonly LiteratureNetworkEdge[]) {
  const pairs = new Map<string, { id: string; source: string; target: string; edges: LiteratureNetworkEdge[] }>();
  for (const edge of edges) {
    if (edge.source === edge.target) continue;
    const [source, target] = edge.source < edge.target ? [edge.source, edge.target] : [edge.target, edge.source];
    const id = JSON.stringify([source, target]);
    const pair = pairs.get(id);
    if (pair) pair.edges.push(edge);
    else pairs.set(id, { id, source, target, edges: [edge] });
  }
  return Array.from(pairs.values());
}

export type RelationshipPair = ReturnType<typeof groupRelationships>[number];

export function createRelationshipLayout(
  papers: readonly LiteratureNetworkNode[], pairs: readonly RelationshipPair[], maxCitations: number,
): RelationshipLayout {
  // Keep the camera fit independent of both the current forces and the dragged node.
  const width = Math.max(360, Math.sqrt(papers.length) * 162);
  const height = Math.max(250, width * 0.73);
  const scale = Math.max(1, Math.log1p(maxCitations));
  const points = papers.map(({ id, citationCount }, index): PositionedPaper => {
    const distance = papers.length > 1 ? Math.sqrt((index + 0.5) / papers.length) * 0.47 : 0;
    const angle = index * GOLDEN_ANGLE - Math.PI * 0.6;
    return {
      id,
      radius: 7 + 10 * Math.log1p(citationCount ?? 0) / scale,
      x: Math.cos(angle) * distance * (width / 2 - 28),
      y: Math.sin(angle) * distance * (height / 2 - 28),
    };
  });
  const indexById = new Map(points.map(({ id }, index) => [id, index]));
  const springs: Spring[] = [];
  for (const pair of pairs) {
    const source = indexById.get(pair.source);
    const target = indexById.get(pair.target);
    if (source === undefined || target === undefined) continue;
    // Witness lists are capped. Their lengths weight the spring, not the displayed evidence count.
    const weight = pair.edges.reduce((sum, edge) => sum + (edge.kind === "citation" ? 0.6 : 1 + Math.log2(edge.evidence.length)), 0);
    springs.push({ source, target, strength: 0.18 + Math.log1p(weight) * 0.26 });
  }
  const spacing = Math.min(220, Math.sqrt((width - 56) * (height - 56) / Math.max(1, points.length)));
  return { points, width, height, springs, spacing };
}

export function startRelationshipSimulation(layout: RelationshipLayout): RelationshipSimulation {
  return { layout, points: layout.points.map((point) => ({ ...point, vx: 0, vy: 0 })), pinned: null, temperature: 1 };
}

export function stepRelationshipSimulation(simulation: RelationshipSimulation) {
  const { points, pinned, temperature, layout: { springs, spacing } } = simulation;
  if (temperature < MIN_TEMPERATURE) return false;
  // Forces update velocity. Damping and the cooling speed limit keep the initial spread and release smooth.
  const impulse = 0.12 * temperature;
  const charge = spacing * spacing * 0.55 * impulse;
  const restLength = spacing * 0.58;
  for (const point of points) {
    point.vx = point.vx * 0.68 - point.x * 0.68 * impulse;
    point.vy = point.vy * 0.68 - point.y * 0.94 * impulse;
  }
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    for (let j = i + 1; j < points.length; j++) {
      const b = points[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distanceSquared = dx * dx + dy * dy;
      const force = charge / Math.max(144, distanceSquared);
      a.vx -= dx * force;
      a.vy -= dy * force;
      b.vx += dx * force;
      b.vy += dy * force;
    }
  }
  for (const { source, target, strength } of springs) {
    const a = points[source];
    const b = points[target];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const force = (1 - restLength / Math.max(1, distance)) * strength * impulse;
    a.vx += dx * force;
    a.vy += dy * force;
    b.vx -= dx * force;
    b.vy -= dy * force;
  }
  const maxSpeed = 12 * temperature + 0.25;
  for (const point of points) {
    if (point === pinned) {
      point.vx = 0;
      point.vy = 0;
      continue;
    }
    const speed = Math.sqrt(point.vx * point.vx + point.vy * point.vy);
    if (speed > maxSpeed) {
      point.vx *= maxSpeed / speed;
      point.vy *= maxSpeed / speed;
    }
    point.x += point.vx;
    point.y += point.vy;
  }

  // Project overlapping marks apart. A dragged mark stays exactly at the pointer.
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    for (let j = i + 1; j < points.length; j++) {
      const b = points[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distanceSquared = dx * dx + dy * dy;
      const separation = Math.max(a.radius, 12) + Math.max(b.radius, 12) + 11;
      if (distanceSquared >= separation * separation) continue;
      const distance = Math.sqrt(distanceSquared);
      const overlap = separation - distance;
      const shiftX = distance > 0 ? dx / distance * overlap : overlap;
      const shiftY = distance > 0 ? dy / distance * overlap : 0;
      const shareA = a === pinned ? 0 : b === pinned ? 1 : 0.5;
      a.x -= shiftX * shareA;
      a.y -= shiftY * shareA;
      b.x += shiftX * (1 - shareA);
      b.y += shiftY * (1 - shareA);
    }
  }
  simulation.temperature *= 0.95;
  return simulation.temperature >= MIN_TEMPERATURE;
}

export function settleRelationshipSimulation(simulation: RelationshipSimulation) {
  if (simulation.points.length === 0) return;
  while (stepRelationshipSimulation(simulation)) { /* Same solver, without showing intermediate frames. */ }
}

export function snapshotRelationshipPositions({ points }: RelationshipSimulation) {
  return points.map(({ id, x, y, radius }) => ({ id, x, y, radius }));
}

export interface RelationshipRoute {
  id: string;
  pairId: string;
  edge: LiteratureNetworkEdge;
  sourceIndex: number;
  targetIndex: number;
  bend: number;
}

export function createRelationshipRoutes(pairs: readonly RelationshipPair[], points: readonly PositionedPaper[]) {
  const indexById = new Map(points.map(({ id }, index) => [id, index]));
  const routes: RelationshipRoute[] = [];
  for (const pair of pairs) {
    for (const [index, edge] of pair.edges.entries()) {
      const sourceIndex = indexById.get(edge.source);
      const targetIndex = indexById.get(edge.target);
      if (sourceIndex === undefined || targetIndex === undefined) continue;
      const bend = (index - (pair.edges.length - 1) / 2) * 28 * (edge.source === pair.source ? 1 : -1);
      routes.push({ id: networkEdgeId(edge), pairId: pair.id, edge, sourceIndex, targetIndex, bend });
    }
  }
  return routes;
}

export function relationshipPath({ sourceIndex, targetIndex, bend }: RelationshipRoute, points: readonly PositionedPaper[]) {
  const source = points[sourceIndex];
  const target = points[targetIndex];
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (!length) return "";
  const curveX = (source.x + target.x) / 2 - dy / length * bend;
  const curveY = (source.y + target.y) / 2 + dx / length * bend;
  const startInset = (source.radius + 5) / Math.hypot(curveX - source.x, curveY - source.y);
  const endInset = (target.radius + 6) / Math.hypot(curveX - target.x, curveY - target.y);
  const startX = source.x + (curveX - source.x) * startInset;
  const startY = source.y + (curveY - source.y) * startInset;
  const endX = target.x + (curveX - target.x) * endInset;
  const endY = target.y + (curveY - target.y) * endInset;
  return `M ${startX} ${startY} Q ${curveX} ${curveY} ${endX} ${endY}`;
}
