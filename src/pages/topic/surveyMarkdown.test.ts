import { describe, expect, it } from "vitest";
import type { TopicSurvey } from "@/lib/api";
import { renderTopicSurveyMarkdown, topicSurveyMarkdownFilename } from "./surveyMarkdown";

describe("renderTopicSurveyMarkdown", () => {
  it("exports an editable survey draft with source counts and paper metadata", () => {
    const markdown = renderTopicSurveyMarkdown(sampleSurvey(), "2026-06-19T10:00:00.000Z");

    expect(markdown).toContain("# Topic Survey: retrieval augmented generation");
    expect(markdown).toContain("- Source papers: 1");
    expect(markdown).toContain("- Must-read papers: 1");
    expect(markdown).toContain("## Key Researchers");
    expect(markdown).toContain("- **Jane Doe**: Built the benchmark.");
    expect(markdown).toContain("### Retrieval");
    expect(markdown).toContain("- Search terms: dense retrieval, reranking");
    expect(markdown).toContain("#### Paper 1");
    expect(markdown).toContain("- Status: must-read");
    expect(markdown).toContain("- DOI: 10.123/example");
    expect(markdown).toContain("- arXiv: 2401.12345");
  });

  it("builds a stable markdown filename from the topic and date", () => {
    expect(topicSurveyMarkdownFilename(sampleSurvey(), "2026-06-19T10:00:00.000Z"))
      .toBe("topic-survey-retrieval-augmented-generation-2026-06-19.md");
  });

  it("uses an ASCII fallback filename for non-Latin topics", () => {
    expect(topicSurveyMarkdownFilename({ ...sampleSurvey(), topic: "中文主题" }, "2026-06-19"))
      .toBe("topic-survey-topic-survey-2026-06-19.md");
  });
});

function sampleSurvey(): TopicSurvey {
  return {
    topic: "retrieval augmented generation",
    subareas: [
      {
        name: "Retrieval",
        year_range: [2020, 2026],
        summary: "Retrieval systems.",
        search_terms: ["dense retrieval", "reranking"],
        papers: [
          {
            id: "p1",
            title: "Paper 1",
            authors: ["A. Author", "B. Author"],
            year: 2024,
            venue: "TestConf",
            doi: "10.123/example",
            arxiv_id: "2401.12345",
            abstract_text: "A useful paper.",
            citation_count: 12,
            influential_citation_count: 3,
            why_important: "Defines the baseline.",
            must_read: true,
          },
        ],
      },
      {
        name: "Ranking",
        year_range: null,
        summary: "Ranking systems.",
        search_terms: ["reranking"],
        papers: [
          {
            id: "p1",
            title: "Paper 1",
            authors: ["A. Author", "B. Author"],
            year: 2024,
            venue: "TestConf",
            doi: "10.123/example",
            arxiv_id: "2401.12345",
            abstract_text: "A useful paper.",
            citation_count: 12,
            influential_citation_count: 3,
            why_important: "Defines the baseline.",
            must_read: true,
          },
        ],
      },
    ],
    key_pis: [{ name: "Jane Doe", why_central: "Built the benchmark." }],
    must_read_ids: ["p1"],
    annotated: true,
    plan_model: "planner",
    plan_tokens: 120,
    annotate_model: "annotator",
    annotate_tokens: 80,
  };
}
