import { describe, expect, it } from "vitest";
import type { GraphEdge } from "@/lib/api";
import { paperLinkIdFromGraphEdge } from "./graphEdgeActions";

describe("paperLinkIdFromGraphEdge", () => {
  it("extracts deletable paper link ids from graph edges", () => {
    expect(paperLinkIdFromGraphEdge(edge("link:42"))).toBe(42);
  });

  it("does not treat derived graph edges as deletable paper links", () => {
    expect(paperLinkIdFromGraphEdge(edge("term:p1:retrieval"))).toBeNull();
    expect(paperLinkIdFromGraphEdge(edge("pc:p1:3"))).toBeNull();
  });
});

function edge(id: string): GraphEdge {
  return {
    id,
    source: "p1",
    target: "p2",
    edge_type: "manual",
    relation: "related",
    source_type: "user",
    confidence: 1,
    snippet: null,
  };
}
