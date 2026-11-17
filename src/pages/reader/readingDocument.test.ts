import { describe, expect, it } from "vitest";

import { parseReadingDocument } from "./readingDocument";

const SOURCE = `<!-- page:1 -->
# Attention Is All You Need

<!-- page:2 -->
## Method

The encoder maps tokens to 512-dimensional embeddings.

| Layer | Heads |
| --- | --- |
| Encoder | 8 |

- one
- two

> quoted line

\`\`\`text
untouched
\`\`\`
`;

describe("parseReadingDocument", () => {
  it("records the page each block belongs to", () => {
    const doc = parseReadingDocument(SOURCE);

    expect(doc.hasPageMarkers).toBe(true);
    expect(doc.blocks.map((block) => block.page)).toEqual([1, 2, 2, 2, 2, 2, 2]);
    expect(doc.blocks.map((block) => block.kind)).toEqual([
      "heading",
      "heading",
      "paragraph",
      "table",
      "list",
      "quote",
      "code",
    ]);
    expect(doc.blocks[0].level).toBe(1);
    expect(doc.blocks[1].level).toBe(2);
  });

  it("keeps table, list, quote and fence bodies as single blocks", () => {
    const doc = parseReadingDocument(SOURCE);
    const [, , , table, list, quote, code] = doc.blocks;

    expect(table.markdown.split("\n")).toHaveLength(3);
    expect(list.markdown).toBe("- one\n- two");
    expect(quote.markdown).toBe("> quoted line");
    expect(code.markdown).toContain("untouched");
  });

  it("flags extraction noise and reports documents without markers", () => {
    const doc = parseReadingDocument("Body text\n\nPage 7\n\n3 of 12\n\nMore text");

    expect(doc.hasPageMarkers).toBe(false);
    expect(doc.blocks.filter((block) => block.artifact).map((block) => block.markdown)).toEqual(["Page 7", "3 of 12"]);
    expect(doc.blocks.filter((block) => !block.artifact)).toHaveLength(2);
  });

  it("does not treat a marker inside a code fence as a page break", () => {
    const doc = parseReadingDocument("```\n<!-- page:9 -->\n```");

    expect(doc.hasPageMarkers).toBe(false);
    expect(doc.blocks).toHaveLength(1);
  });
});

