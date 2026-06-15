import { describe, expect, it, vi } from "vitest";
import type { Paper } from "@/lib/api";
import { importDoiWithAutoPdfAndLink } from "./doiImportActions";

const api = {
  doiAddWithPdf: vi.fn(async (doi: string) => paper(`paper-${doi}`)),
  paperLinkCreateOrGet: vi.fn(async () => undefined),
};

function paper(id: string): Paper {
  return {
    id,
    title: "Cited paper",
    authors: ["A. Author"],
    year: 2026,
    venue: "Journal",
    doi: "10.1145/1234567",
    arxiv_id: null,
    abstract_text: null,
    pdf_path: "/library/cited/original.pdf",
    note_path: null,
    added_at: 1,
    updated_at: 1,
    read_status: "unread",
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

describe("importDoiWithAutoPdfAndLink", () => {
  it("downloads a DOI paper before linking it from the source paper", async () => {
    const imported = await importDoiWithAutoPdfAndLink(api, "source-1", "10.1145/1234567");

    expect(api.doiAddWithPdf).toHaveBeenCalledWith("10.1145/1234567");
    expect(api.paperLinkCreateOrGet).toHaveBeenCalledWith(
      "source-1",
      "paper-10.1145/1234567",
      "builds_on",
      "DOI link clicked in PDF: 10.1145/1234567",
    );
    expect(imported.id).toBe("paper-10.1145/1234567");
  });
});
