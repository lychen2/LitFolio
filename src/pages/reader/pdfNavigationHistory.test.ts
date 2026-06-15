import { describe, expect, it } from "vitest";
import {
  pushPdfNavigationPosition,
  shouldRecordPdfNavigation,
} from "./pdfNavigationHistory";

describe("PDF navigation history", () => {
  it("records figure and internal PDF jumps", () => {
    const figure = anchor("", "Fig. 2");
    figure.dataset.figLink = "1";
    expect(shouldRecordPdfNavigation(figure, "asset://paper.pdf")).toBe(true);

    expect(shouldRecordPdfNavigation(anchor("#page=12", "References"), "asset://paper.pdf")).toBe(true);
  });

  it("does not record DOI links because they open the import dialog", () => {
    expect(shouldRecordPdfNavigation(anchor("https://doi.org/10.1145/1234567", "doi"), "asset://paper.pdf")).toBe(false);
    expect(shouldRecordPdfNavigation(anchor("", "10.1145/1234567"), "asset://paper.pdf")).toBe(false);
  });

  it("skips duplicate scroll positions", () => {
    const stack = pushPdfNavigationPosition([], { scrollTop: 120 });
    expect(pushPdfNavigationPosition(stack, { scrollTop: 122 })).toEqual(stack);
    expect(pushPdfNavigationPosition(stack, { scrollTop: 180 })).toEqual([
      { scrollTop: 120 },
      { scrollTop: 180 },
    ]);
  });
});

function anchor(href: string, text: string): HTMLAnchorElement {
  const dataset: Record<string, string> = {};
  const hash = href.startsWith("#") ? href : "";
  return {
    href,
    hash,
    dataset,
    textContent: text,
    getAttribute: (name: string) => (name === "href" ? href : null),
  } as HTMLAnchorElement;
}
