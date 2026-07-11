import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "@/i18n/I18nProvider";
import type { SurveySubareaResult } from "@/lib/api";
import { SubareaCard } from "./SubareaCard";

describe("SubareaCard", () => {
  it("shows the search terms used for a subarea", () => {
    const html = renderToString(
      <I18nProvider lang="en">
        <SubareaCard subarea={subarea()} />
      </I18nProvider>,
    );

    expect(html).toContain("Search terms");
    expect(html).toContain("retrieval augmented generation");
    expect(html).toContain("dense retrieval");
  });
});

function subarea(): SurveySubareaResult {
  return {
    name: "Retrieval",
    year_range: [2020, 2026],
    summary: "Retrieval systems.",
    search_terms: ["retrieval augmented generation", "dense retrieval"],
    papers: [],
  };
}
