import { createElement as el } from "react";
import { createRoot } from "react-dom/client";
import { loadLiteratureNetwork } from "../../src/features/literature-network/network";
import type { LiteratureNetwork } from "../../src/features/literature-network/network";
import { useNetworkTitleTranslation } from "../../src/features/literature-network/useNetworkTitleTranslation";

function TranslationFixture({ result }: { result: LiteratureNetwork }) {
  const { displayResult, translating, showingTranslation, error, toggle } = useNetworkTitleTranslation(result);
  return el("main", null,
    el("button", { type: "button", disabled: translating, onClick: toggle },
      showingTranslation ? "Show original" : "Translate titles"),
    translating && el("p", { role: "status" }, "Translating"),
    error && el("p", { role: "alert" }, error),
    el("ul", { "aria-label": "Papers" }, displayResult.nodes.map((node) =>
      el("li", { key: node.id }, node.title))),
    el("ul", { "aria-label": "Evidence" }, displayResult.edges.flatMap((edge) =>
      edge.evidence.map((work) => el("li", { key: `${edge.kind}:${work.id}` },
        el("a", { href: work.url }, work.title))))),
  );
}

const container = document.getElementById("root");
if (!container) throw new Error("Missing translation test root");
const root = createRoot(container);
const result = await loadLiteratureNetwork(["paper-1"]);
const fixture: LiteratureNetwork = {
  ...result,
  edges: result.edges.map((edge) => edge.kind === "citation" ? {
    ...edge,
    evidence: [{ ...edge.evidence[0], title: "Alternate form of the seed title" }],
  } : {
    ...edge,
    evidence: [
      ...edge.evidence,
      { id: "W4", title: edge.evidence[0].title, url: "https://openalex.org/W4" },
      { id: "W5", title: "W5", url: "https://openalex.org/W5" },
    ],
  }),
};
root.render(el(TranslationFixture, { result: fixture }));
