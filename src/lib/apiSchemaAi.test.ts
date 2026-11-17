import { describe, expect, it } from "vitest";

import { parsePaperMarkdown } from "./apiSchemaAi";

describe("paper markdown parser", () => {
  it("accepts the cached body string", () => {
    expect(parsePaperMarkdown("# Body", "paper_markdown_get")).toBe("# Body");
  });

  it("accepts a missing body", () => {
    expect(parsePaperMarkdown(null, "paper_markdown_get")).toBeNull();
  });

  it("rejects a non-string body with the command path", () => {
    expect(() => parsePaperMarkdown(42, "paper_markdown_get")).toThrow(
      "paper_markdown_get",
    );
  });
});
