import { describe, expect, it } from "vitest";
import type { Paper, Tag } from "@/lib/api";
import { filterLibraryPapers, type LibraryFilterState } from "./libraryFilters";

describe("filterLibraryPapers", () => {
  it("combines year, tag, folder context, and read status filters", () => {
    const filters: LibraryFilterState = {
      year: "2024",
      readStatus: "unread",
      tagId: "2",
    };

    const result = filterLibraryPapers(
      [paper("keep", 2024, "unread"), paper("wrong-year", 2023, "unread"), paper("wrong-status", 2024, "read")],
      {
        keep: [tag(2, "Topic")],
        "wrong-year": [tag(2, "Topic")],
        "wrong-status": [tag(2, "Topic")],
      },
      filters,
    );

    expect(result.map((paper) => paper.id)).toEqual(["keep"]);
  });

  it("leaves papers unchanged when no filter is active", () => {
    const papers = [paper("a", 2024, "unread"), paper("b", null, "read")];

    expect(filterLibraryPapers(papers, {}, { year: "", readStatus: "", tagId: "" })).toEqual(papers);
  });
});

function paper(id: string, year: number | null, read_status: Paper["read_status"]): Paper {
  return {
    id,
    title: id,
    authors: [],
    year,
    venue: null,
    doi: null,
    arxiv_id: null,
    abstract_text: null,
    pdf_path: "/tmp/test.pdf",
    note_path: null,
    added_at: 1,
    updated_at: 1,
    read_status,
    tldr: null,
    research_question: null,
    method: null,
    dataset: null,
    key_findings: [],
    limitations: null,
    comparison: null,
    title_translated: null,
    abstract_translated: null,
    translate_target_lang: null,
    translated_at: null,
    bibtex: null,
  };
}

function tag(id: number, name: string): Tag {
  return { id, name, parent_id: null, color: null };
}
