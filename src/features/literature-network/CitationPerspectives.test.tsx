import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/I18nProvider";
import CitationPerspectives from "./CitationPerspectives";
import { deriveCitationPerspectives } from "./citationPerspectiveData";
import type { CitationPerspectiveEntry } from "./citationPerspectiveData";
import type { LiteratureNetwork, LiteratureNetworkEdge, LiteratureNetworkNode } from "./network";

function paper(id: string, title: string): LiteratureNetworkNode {
  return {
    id, title, authors: [], year: null, venue: null, doi: null, arxivId: null,
    url: `https://openalex.org/${id}`, libraryPaperId: null, isSeed: false,
    groupId: null, citationCount: 10000, score: 0,
  };
}

function edge(kind: LiteratureNetworkEdge["kind"], source: string, target: string, ...witnesses: string[]): LiteratureNetworkEdge {
  return { source, target, kind, evidence: witnesses.map((id) => ({ id, title: id, url: `https://openalex.org/${id}` })) };
}

function network(nodes: LiteratureNetworkNode[], edges: LiteratureNetworkEdge[]): LiteratureNetwork {
  return { nodes, edges, groups: [], unresolvedSeedIds: [] };
}

function matches(entries: CitationPerspectiveEntry[]) {
  return entries.map(({ work, matches }) => [work.id, matches.map(({ node }) => node.id)]);
}

const a = paper("W1", "Alpha");
const b = paper("W2", "Beta");
const c = paper("W3", "Gamma");

const externalPerspectives = network([a, b, c], [
  edge("shared_reference", a.id, b.id, "W4", "W4"),
  edge("shared_reference", c.id, b.id, "W4"),
  edge("co_citation", b.id, a.id, "W5", "W5"),
  edge("co_citation", c.id, a.id, "W5"),
]);

describe("deriveCitationPerspectives", () => {
  it("uses shared references as cited works and co-citers as citing works, without treating endpoints as citing each other", () => {
    const result = deriveCitationPerspectives(externalPerspectives);
    expect(matches(result.prior)).toEqual([["W4", [a.id, b.id, c.id]]]);
    expect(matches(result.subsequent)).toEqual([["W5", [a.id, b.id, c.id]]]);
    expect(result.prior[0].work.url).toBe("https://openalex.org/W4");
    expect(result.subsequent[0].work.url).toBe("https://openalex.org/W5");
  });

  it("counts a direct relation and its indirect corroborations once and ranks by distinct graph peers", () => {
    const foundation = paper("W4", "In-graph reference");
    const result = deriveCitationPerspectives(network([a, b, c, foundation], [
      edge("citation", c.id, foundation.id, c.id),
      edge("citation", c.id, foundation.id, c.id),
      edge("shared_reference", a.id, b.id, foundation.id),
      edge("co_citation", foundation.id, b.id, c.id, c.id),
      edge("co_citation", b.id, a.id, "W5"),
      edge("co_citation", a.id, foundation.id, "W6"),
      edge("co_citation", b.id, foundation.id, "W6"),
    ]));
    expect(matches(result.prior)).toEqual([[foundation.id, [a.id, b.id, c.id]]]);
    expect(matches(result.subsequent)).toEqual([
      ["W6", [a.id, b.id, foundation.id]],
      [c.id, [b.id, foundation.id]],
      ["W5", [a.id, b.id]],
    ]);
    expect(result.prior[0].work.node).toBe(foundation);
    expect(result.prior[0].matches.find(({ node }) => node === c)?.evidenceKinds)
      .toEqual(new Set(["citation", "co_citation"]));
  });

  it("uses in-graph witnesses in both perspectives and does not count graph-external peers, global citations or self links", () => {
    const result = deriveCitationPerspectives(network([a, b, c], [
      edge("shared_reference", a.id, b.id, c.id, a.id, "W4"),
      edge("shared_reference", b.id, a.id, "W6"),
      edge("co_citation", a.id, b.id, c.id, b.id, "W5"),
      edge("co_citation", b.id, a.id, "W7"),
      edge("citation", a.id, a.id, a.id),
      edge("citation", a.id, "W6", a.id),
    ]));
    expect(matches(result.prior)).toEqual([[c.id, [a.id, b.id]], ["W4", [a.id, b.id]], ["W6", [a.id, b.id]]]);
    expect(matches(result.subsequent)).toEqual([[c.id, [a.id, b.id]], ["W5", [a.id, b.id]], ["W7", [a.id, b.id]]]);
    expect(deriveCitationPerspectives(network([a, b], [edge("citation", a.id, b.id, a.id)])))
      .toEqual({ prior: [], subsequent: [] });
  });
});

describe("CitationPerspectives", () => {
  it("renders directional counts, disclosure evidence and OpenAlex records in English", () => {
    const html = renderToStaticMarkup(
      <I18nProvider lang="en"><CitationPerspectives result={externalPerspectives} onSelect={vi.fn()} /></I18nProvider>,
    );
    expect(html).toContain("Prior works");
    expect(html).toContain("Subsequent works");
    expect(html).toContain("Cited by 3 papers in this graph");
    expect(html).toContain("Cites 3 papers in this graph");
    expect(html).toContain("<summary");
    expect(html).toContain("Shared reference");
    expect(html).toContain("Co-citation");
    expect(html).toContain('href="https://openalex.org/W4"');
    expect(html).toContain('href="https://openalex.org/W5"');
  });

  it("renders independent Chinese empty states", () => {
    const html = renderToStaticMarkup(
      <I18nProvider lang="zh"><CitationPerspectives result={network([], [])} onSelect={vi.fn()} /></I18nProvider>,
    );
    expect(html).toContain("基础工作");
    expect(html).toContain("后续工作");
    expect(html).toContain("未发现被至少两篇图内论文引用的作品。");
    expect(html).toContain("未发现引用至少两篇图内论文的作品。");
    expect(html).not.toContain("<details");
  });
});
