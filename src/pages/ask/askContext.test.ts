import { describe, expect, it } from "vitest";
import type { AskLibraryResult } from "@/lib/api";
import { summarizeAskContext } from "../AskPage";

describe("summarizeAskContext", () => {
  it("counts unique papers, highlights and document hits", () => {
    const result: AskLibraryResult = {
      answer: "...",
      sources: [
        { paper_id: "p1", title: "A", year: 2024, authors: [], snippet: "Highlight: a\nMethod: m" },
        { paper_id: "p2", title: "B", year: 2024, authors: [], snippet: "Highlight: x\nHighlight: y" },
        { paper_id: "p2", title: "B", year: 2024, authors: [], snippet: "Document Markdown: foo" },
      ],
      model: "test",
      prompt_tokens: 0,
      completion_tokens: 0,
      terms: [],
      retrieved_count: 3,
    };

    expect(summarizeAskContext(result)).toEqual({ papers: 2, highlights: 3, documents: 1 });
  });

  it("returns zero counts for empty results", () => {
    const result: AskLibraryResult = {
      answer: "",
      sources: [],
      model: "",
      prompt_tokens: 0,
      completion_tokens: 0,
      terms: [],
      retrieved_count: 0,
    };

    expect(summarizeAskContext(result)).toEqual({ papers: 0, highlights: 0, documents: 0 });
  });
});
