import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import type { Paper } from "@/lib/api";
import { updatePaperStatusCache } from "./paperStatusCache";

describe("updatePaperStatusCache", () => {
  it("updates one paper status without collapsing cached library lists", () => {
    const client = new QueryClient();
    const first = paper("paper-1", "unread");
    const second = paper("paper-2", "read");

    client.setQueryData(["papers", "list", null, null, ""], [first, second]);
    client.setQueryData(["papers", "recent", 10], [first, second]);
    client.setQueryData(["papers", "count"], 2);
    const arxivIds = ["1234.5678"];
    client.setQueryData(["papers", "arxiv-ids"], arxivIds);
    client.setQueryData(["paper", first.id], first);

    updatePaperStatusCache(client, first.id, "must");

    expect(client.getQueryData<Paper[]>(["papers", "list", null, null, ""]))
      .toMatchObject([
        { id: first.id, read_status: "must" },
        { id: second.id, read_status: "read" },
      ]);
    expect(client.getQueryData<Paper[]>(["papers", "recent", 10])).toMatchObject([
      { id: first.id, read_status: "must" },
      { id: second.id, read_status: "read" },
    ]);
    expect(client.getQueryData<Paper>(["paper", first.id])?.read_status).toBe("must");
    expect(client.getQueryData(["papers", "count"])).toBe(2);
    expect(client.getQueryData(["papers", "arxiv-ids"])).toBe(arxivIds);
  });
});

function paper(id: string, readStatus: Paper["read_status"]): Paper {
  return {
    id,
    title: `Paper ${id}`,
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
    read_status: readStatus,
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
