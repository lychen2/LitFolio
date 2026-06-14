import { describe, expect, it, vi } from "vitest";

import type { CandidatePaper, Paper } from "@/lib/api";
import { importCandidate, type CandidateImportApi } from "./CandidateInboxPage";

const paper: Paper = {
  id: "paper-1",
  title: "Imported Paper",
  authors: [],
  year: null,
  venue: null,
  doi: null,
  arxiv_id: null,
  abstract_text: null,
  pdf_path: null,
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

function candidate(overrides: Partial<CandidatePaper> = {}): CandidatePaper {
  return {
    id: 7,
    title: "Candidate Paper",
    authors: ["Ada Lovelace"],
    year: 2026,
    venue: "LitFolio Tests",
    doi: null,
    arxiv_id: null,
    abstract_text: "Candidate abstract.",
    source_type: "semantic_scholar",
    source_url: null,
    status: "new",
    related_project: null,
    created_at: 1,
    last_seen_at: 1,
    ...overrides,
  };
}

function candidateApi(): CandidateImportApi {
  return {
    arxivAddWithPdf: vi.fn(async () => paper),
    importDoi: vi.fn(async () => paper),
    arxivAddDraft: vi.fn(async () => paper),
    candidateSetStatus: vi.fn(async () => undefined),
  };
}

describe("importCandidate", () => {
  it("imports arXiv candidates with PDF auto-download", async () => {
    const api = candidateApi();

    await importCandidate(candidate({ arxiv_id: "2401.01234" }), api);

    expect(api.arxivAddWithPdf).toHaveBeenCalledWith("2401.01234");
    expect(api.importDoi).not.toHaveBeenCalled();
    expect(api.arxivAddDraft).not.toHaveBeenCalled();
    expect(api.candidateSetStatus).toHaveBeenCalledWith(7, "imported");
  });

  it("imports DOI candidates when only a DOI URL is available", async () => {
    const api = candidateApi();

    await importCandidate(
      candidate({ source_url: "https://doi.org/10.1145/1234567?x=1" }),
      api
    );

    expect(api.importDoi).toHaveBeenCalledWith("10.1145/1234567");
    expect(api.arxivAddWithPdf).not.toHaveBeenCalled();
    expect(api.arxivAddDraft).not.toHaveBeenCalled();
    expect(api.candidateSetStatus).toHaveBeenCalledWith(7, "imported");
  });

  it("imports metadata-only candidates as paper drafts", async () => {
    const api = candidateApi();

    await importCandidate(candidate(), api);

    expect(api.arxivAddDraft).toHaveBeenCalledWith({
      title: "Candidate Paper",
      authors: ["Ada Lovelace"],
      year: 2026,
      venue: "LitFolio Tests",
      doi: null,
      arxiv_id: null,
      abstract_text: "Candidate abstract.",
    });
    expect(api.arxivAddWithPdf).not.toHaveBeenCalled();
    expect(api.importDoi).not.toHaveBeenCalled();
    expect(api.candidateSetStatus).toHaveBeenCalledWith(7, "imported");
  });

  it("throws when a candidate has no usable import identity or title", async () => {
    const api = candidateApi();

    await expect(
      importCandidate(candidate({ title: " " }), api)
    ).rejects.toThrow("missing title, arXiv ID, and DOI");
    expect(api.candidateSetStatus).not.toHaveBeenCalled();
  });
});
