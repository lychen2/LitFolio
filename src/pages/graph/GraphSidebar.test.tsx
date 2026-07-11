import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "@/i18n/I18nProvider";
import type { GraphData, GraphNode } from "@/lib/api";
import { GraphSidebar } from "./GraphSidebar";

describe("GraphSidebar", () => {
  it("renders a selected graph node as a detail drawer", () => {
    const html = renderSidebar({
      id: "concept:retrieval",
      node_type: "concept",
      label: "Retrieval",
      sublabel: "Search and rank papers",
      paper_count: 3,
    });

    expect(html).toContain("Retrieval");
    expect(html).toContain("Search and rank papers");
    expect(html).toContain("Center in mindmap");
  });
});

function renderSidebar(node: GraphNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const graphData: GraphData = { nodes: [node], edges: [] };
  return renderToString(
    <I18nProvider lang="en">
      <QueryClientProvider client={client}>
        <StaticRouter location="/graph">
          <GraphSidebar
            node={node}
            graphData={graphData}
            onClose={() => undefined}
            onCenterConcept={() => undefined}
          />
        </StaticRouter>
      </QueryClientProvider>
    </I18nProvider>,
  );
}
