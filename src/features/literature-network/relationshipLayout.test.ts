import { describe, expect, it } from "vitest";
import type { LiteratureNetworkEdge, LiteratureNetworkNode } from "./network";
import {
  createRelationshipLayout, createRelationshipRoutes, groupRelationships, relationshipPath, settleRelationshipSimulation,
  snapshotRelationshipPositions, startRelationshipSimulation, stepRelationshipSimulation,
} from "./relationshipLayout";

const papers: LiteratureNetworkNode[] = Array.from({ length: 35 }, (_, index) => ({
  id: `W${index}`,
  title: `Paper ${index}`,
  year: null,
  authors: [],
  venue: null,
  doi: null,
  arxivId: null,
  url: null,
  libraryPaperId: null,
  isSeed: index < 5,
  groupId: null,
  citationCount: index < 5 ? 500 : index,
  score: 0,
}));
const evidence = [{ id: "witness", title: "Witness", url: "https://openalex.org/W100" }];

function edge(source: string, target: string, kind: LiteratureNetworkEdge["kind"] = "shared_reference"): LiteratureNetworkEdge {
  return { source, target, kind, evidence };
}

function settle(nodes: LiteratureNetworkNode[], edges: LiteratureNetworkEdge[]) {
  const simulation = startRelationshipSimulation(createRelationshipLayout(nodes, groupRelationships(edges), 500));
  settleRelationshipSimulation(simulation);
  return snapshotRelationshipPositions(simulation);
}

describe("paper relationship layout", () => {
  it("expands the world with the paper count and separates the node targets", () => {
    const dense = papers.flatMap((paper, index) => papers.slice(index + 1).map((other) => edge(paper.id, other.id)));
    const positions = settle(papers, dense);
    expect(positions).toEqual(settle(papers, dense));
    const span = (points: typeof positions) => Math.max(...points.map(({ x }) => x)) - Math.min(...points.map(({ x }) => x));
    const smaller = dense.filter(({ source, target }) => papers.slice(0, 8).some(({ id }) => id === source)
      && papers.slice(0, 8).some(({ id }) => id === target));
    expect(span(positions)).toBeGreaterThan(span(settle(papers.slice(0, 8), smaller)));
    expect(positions).toHaveLength(35);
    expect(positions[0].radius).toBeGreaterThan(positions[positions.length - 1].radius);
    let smallestGap = Infinity;
    for (let i = 0; i < positions.length; i++) {
      const a = positions[i];
      expect(Number.isFinite(a.x) && Number.isFinite(a.y)).toBe(true);
      for (const b of positions.slice(i + 1)) {
        const gap = Math.hypot(a.x - b.x, a.y - b.y) - Math.max(a.radius + 5, 13) - Math.max(b.radius + 5, 13);
        smallestGap = Math.min(smallestGap, gap);
      }
    }
    expect(smallestGap).toBeGreaterThan(0);
    expect(createRelationshipRoutes(groupRelationships(dense), positions)).toHaveLength(dense.length);
  });

  it("brings supported similar papers closer and routes different relationships separately", () => {
    const subset = papers.slice(0, 5);
    const edges = [edge("W0", "W1", "citation"), edge("W1", "W0", "citation"), edge("W0", "W1", "co_citation"), edge("W0", "W1")];
    const positions = settle(subset, edges);
    const disconnected = settle(subset, []);
    const distance = (points: typeof positions) => Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    expect(distance(positions)).toBeLessThan(distance(disconnected));
    const pairs = groupRelationships([...edges, edge("W0", "W99")]);
    const routes = createRelationshipRoutes(pairs, positions);
    expect(new Set(routes.map(({ pairId }) => pairId)).size).toBe(1);
    expect(routes.map(({ edge: relationship }) => relationship)).toEqual(edges);
    const paths = routes.map((route) => relationshipPath(route, positions));
    expect(new Set(paths).size).toBe(edges.length);
    expect(paths.every((path) => path && !path.includes("NaN"))).toBe(true);
  });

  it("advances positions independently of snapshots and cools to an idle state", () => {
    const layout = createRelationshipLayout(papers.slice(0, 5), groupRelationships([edge("W0", "W1")]), 500);
    const simulation = startRelationshipSimulation(layout);
    const initial = snapshotRelationshipPositions(simulation);
    expect(stepRelationshipSimulation(simulation)).toBe(true);
    const afterFirstFrame = snapshotRelationshipPositions(simulation);
    expect(afterFirstFrame).not.toEqual(initial);
    expect(stepRelationshipSimulation(simulation)).toBe(true);
    expect(snapshotRelationshipPositions(simulation)).not.toEqual(afterFirstFrame);
    expect(initial).toEqual(layout.points);
    settleRelationshipSimulation(simulation);
    const settled = snapshotRelationshipPositions(simulation);
    expect(stepRelationshipSimulation(simulation)).toBe(false);
    expect(snapshotRelationshipPositions(simulation)).toEqual(settled);
  });

  it("separates coincident marks without moving a pinned paper", () => {
    const simulation = startRelationshipSimulation(createRelationshipLayout(papers.slice(0, 2), [], 500));
    const [first, second] = simulation.points;
    Object.assign(first, { x: 0, y: 0 });
    Object.assign(second, { x: 0, y: 0 });
    simulation.pinned = first;
    stepRelationshipSimulation(simulation);
    expect([first.x, first.y]).toEqual([0, 0]);
    expect(Math.hypot(second.x, second.y)).toBeGreaterThan(first.radius + second.radius);
  });

  it("centers a lone paper without producing a relationship", () => {
    const positions = settle(papers.slice(0, 1), []);
    expect(positions).toEqual([{ id: "W0", x: 0, y: 0, radius: 17 }]);
    expect(createRelationshipRoutes([], positions)).toEqual([]);
  });
});
