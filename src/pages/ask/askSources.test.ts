import { describe, expect, it } from "vitest";
import type { AskSource } from "@/lib/api";
import { askSourceReaderHref } from "../AskPage";

describe("askSourceReaderHref", () => {
  it("links to a paper's reader when paper_id is set", () => {
    const source: AskSource = {
      paper_id: "paper-1",
      title: "Some paper",
      year: 2024,
      authors: ["Author"],
      snippet: "Method:...",
    };
    expect(askSourceReaderHref(source)).toBe("/reader/paper-1");
  });

  it("returns null when paper_id is empty", () => {
    const source: AskSource = {
      paper_id: "",
      title: "Some paper",
      year: 2024,
      authors: [],
      snippet: "",
    };
    expect(askSourceReaderHref(source)).toBeNull();
  });
});
