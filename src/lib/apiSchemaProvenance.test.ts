import { describe, expect, it } from "vitest";

import { parseSourceLink } from "./apiSchemaProvenance";

describe("provenance API schema", () => {
  it("preserves immutable anchors and parses the derived resolution target", () => {
    const link = parseSourceLink(validLink());

    expect(link.segmentId).toBe("rev-paper-1-1:1");
    expect(link.resolvedSegmentId).toBe("rev-paper-1-2:1");
    expect(link.resolvedRevisionId).toBe("rev-paper-1-2");
  });

  it("requires nullable resolution target fields", () => {
    const link = validLink();
    delete (link as Record<string, unknown>).resolvedSegmentId;

    expect(() => parseSourceLink(link)).toThrow("SourceLink.resolvedSegmentId");
  });
});

function validLink() {
  return {
    linkId: "link-1",
    paperId: "paper-1",
    anchorDomain: "note",
    anchorId: "note-paper-1",
    segmentId: "rev-paper-1-1:1",
    revisionId: "rev-paper-1-1",
    snapshot: { page: 1, text: "source text" },
    quoteHash: "hash",
    resolution: "moved",
    resolvedRevisionId: "rev-paper-1-2",
    resolvedSegmentId: "rev-paper-1-2:1",
    createdAt: 1,
    updatedAt: 2,
  };
}
