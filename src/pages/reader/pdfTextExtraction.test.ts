import { describe, expect, it } from "vitest";
import { extractPdfText } from "./pdfTextExtraction";

function textItem(str: string, y: number, size = 10) {
  return {
    str,
    hasEOL: true,
    transform: [1, 0, 0, size, 0, y],
  };
}

function mockDocument(pages: string[][]) {
  return {
    numPages: pages.length,
    async getPage(pageNumber: number) {
      return {
        async getTextContent() {
          return {
            items: pages[pageNumber - 1].map((line, index) =>
              textItem(line, 800 - index * 20, line === "RESULTS" ? 16 : 10),
            ),
          };
        },
      };
    },
  };
}

describe("extractPdfText", () => {
  it("cleans repeated margins, page numbers, noise, and preserves captions", async () => {
    const markdown = await extractPdfText(
      mockDocument([
        ["Optics Communications", "1", "ABSTRACT", "Long-", "term result [ 1 , 2 ].", "15 October 1985"],
        ["Optics Communications", "?? % . . . ?", "RESULTS", "Figure 1. System layout.", "15 October 1985"],
        ["Optics Communications", "DISCUSSION", "Stable compression.", "15 October 1985"],
      ]),
    );

    expect(markdown).toContain("<!-- page:1 -->");
    expect(markdown).toContain("## ABSTRACT");
    expect(markdown).toContain("Longterm result [1, 2].");
    expect(markdown).toContain("Figure 1. System layout.");
    expect(markdown).not.toContain("Optics Communications");
    expect(markdown).not.toContain("15 October 1985");
    expect(markdown).not.toContain("?? %");
  });
});
