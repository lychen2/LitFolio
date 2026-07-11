import { describe, expect, it } from "vitest";
import type { TopicSurvey } from "@/lib/api";
import { surveySourcePaperCount, toggleSurveyMustRead, updateSurveySubareaSummary } from "./topicSurveyState";

describe("toggleSurveyMustRead", () => {
  it("adds a paper to the must-read shortlist", () => {
    const next = toggleSurveyMustRead(sampleSurvey(false), "p1");

    expect(next.must_read_ids).toEqual(["p1"]);
    expect(next.subareas[0].papers[0].must_read).toBe(true);
  });

  it("removes a paper from the must-read shortlist", () => {
    const next = toggleSurveyMustRead(sampleSurvey(true), "p1");

    expect(next.must_read_ids).toEqual([]);
    expect(next.subareas[0].papers[0].must_read).toBe(false);
  });

  it("updates a subarea summary without changing must-read selections", () => {
    const next = updateSurveySubareaSummary(sampleSurvey(true), "Retrieval", "Edited summary");

    expect(next.subareas[0].summary).toBe("Edited summary");
    expect(next.must_read_ids).toEqual(["p1"]);
    expect(next.subareas[0].papers[0].must_read).toBe(true);
  });

  it("counts unique source papers before draft generation", () => {
    const survey = sampleSurvey(true);
    survey.subareas.push({
      ...survey.subareas[0],
      name: "Ranking",
      papers: [{ ...survey.subareas[0].papers[0], must_read: false }],
    });

    expect(surveySourcePaperCount(survey)).toBe(1);
  });
});

function sampleSurvey(mustRead: boolean): TopicSurvey {
  return {
    topic: "retrieval",
    subareas: [
      {
        name: "Retrieval",
        year_range: null,
        summary: "Retrieval papers.",
        search_terms: ["retrieval"],
        papers: [
          {
            id: "p1",
            title: "Paper 1",
            authors: [],
            year: 2024,
            venue: null,
            doi: null,
            arxiv_id: null,
            abstract_text: null,
            citation_count: null,
            influential_citation_count: null,
            why_important: null,
            must_read: mustRead,
          },
        ],
      },
    ],
    key_pis: [],
    must_read_ids: mustRead ? ["p1"] : [],
    annotated: false,
    plan_model: "test",
    plan_tokens: 0,
    annotate_model: null,
    annotate_tokens: 0,
  };
}
