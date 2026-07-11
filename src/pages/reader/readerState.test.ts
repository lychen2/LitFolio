import { describe, expect, it } from "vitest";
import { resolveHighlightJump } from "./readerState";

describe("resolveHighlightJump", () => {
  it("switches native reading back to PDF and queues the highlight", () => {
    expect(resolveHighlightJump({ mode: "native", highlightId: "h1", canScroll: false })).toEqual({
      mode: "pdf",
      pendingJumpId: "h1",
      scrollNow: false,
    });
  });

  it("scrolls immediately when already in PDF and the scroll function is ready", () => {
    expect(resolveHighlightJump({ mode: "pdf", highlightId: "h2", canScroll: true })).toEqual({
      mode: "pdf",
      pendingJumpId: null,
      scrollNow: true,
    });
  });

  it("queues the highlight while PDF scroll function is not ready", () => {
    expect(resolveHighlightJump({ mode: "pdf", highlightId: "h3", canScroll: false })).toEqual({
      mode: "pdf",
      pendingJumpId: "h3",
      scrollNow: false,
    });
  });
});
