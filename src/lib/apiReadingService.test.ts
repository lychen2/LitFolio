import { describe, expect, it } from "vitest";
import { READING_ACTIONS, parseReadingHostMessage } from "./apiReadingService";

const envelope = (payload: Record<string, unknown>) => ({ source: "litfolio-easyread", ...payload });

describe("parseReadingHostMessage action messages", () => {
  it("accepts a paper action with its upstream IDs", () => {
    expect(parseReadingHostMessage(envelope({ type: "action", action: "tldr", paperIds: ["abc12345"] })))
      .toEqual({ type: "action", action: "tldr", paperIds: ["abc12345"] });
  });

  it("keeps every declared action addressable", () => {
    for (const action of READING_ACTIONS) {
      const paperIds = action === "queue-open" || action === "collections" ? [] : ["abc12345"];
      const payload: Record<string, unknown> = { type: "action", action, paperIds };
      if (action === "selection-translate") payload.text = "Selected sentence";
      expect(parseReadingHostMessage(envelope(payload))).toEqual({
        type: "action", action, paperIds, ...(payload.text === undefined ? {} : { text: payload.text }),
      });
    }
  });

  it("allows queue and collection panels without paper IDs", () => {
    expect(parseReadingHostMessage(envelope({ type: "action", action: "queue-open", paperIds: [] })))
      .toEqual({ type: "action", action: "queue-open", paperIds: [] });
    expect(parseReadingHostMessage(envelope({ type: "action", action: "collections", paperIds: [] })))
      .toEqual({ type: "action", action: "collections", paperIds: [] });
  });

  it("rejects a paper action with no IDs", () => {
    expect(() => parseReadingHostMessage(envelope({ type: "action", action: "export", paperIds: [] })))
      .toThrow("at least one paper ID");
  });

  it("rejects unknown actions and malformed IDs", () => {
    expect(() => parseReadingHostMessage(envelope({ type: "action", action: "summarise", paperIds: ["abc12345"] })))
      .toThrow("details, tldr");
    expect(() => parseReadingHostMessage(envelope({ type: "action", action: "tldr", paperIds: ["../../etc"] })))
      .toThrow("upstream paper IDs");
    expect(() => parseReadingHostMessage(envelope({ type: "action", action: "tldr", paperIds: "abc12345" })))
      .toThrow("expected array, got string");
  });

  it("requires selected text for selection translation", () => {
    expect(() => parseReadingHostMessage(envelope({ type: "action", action: "selection-translate", paperIds: ["abc12345"] })))
      .toThrow("selected source text");
    expect(() => parseReadingHostMessage(envelope({ type: "action", action: "selection-translate", paperIds: ["abc12345"], text: "   " })))
      .toThrow("selected source text");
    expect(() => parseReadingHostMessage(envelope({ type: "action", action: "selection-translate", paperIds: ["abc12345", "def67890"], text: "quote" })))
      .toThrow("exactly one paper ID");
    expect(parseReadingHostMessage(envelope({ type: "action", action: "selection-translate", paperIds: ["abc12345"], text: "quote" })))
      .toEqual({ type: "action", action: "selection-translate", paperIds: ["abc12345"], text: "quote" });
  });

  it("still refuses messages from another source and other message types", () => {
    expect(() => parseReadingHostMessage({ source: "other", type: "action", action: "tldr", paperIds: ["abc12345"] }))
      .toThrow("litfolio-easyread");
    expect(() => parseReadingHostMessage(envelope({ type: "theme" })))
      .toThrow("ReadingHostMessage.type");
  });
});

describe("parseReadingHostMessage delete requests", () => {
  it("keeps the paper and request IDs for the host acknowledgement", () => {
    expect(parseReadingHostMessage(envelope({ type: "delete", paperId: "abc12345", requestId: "42" })))
      .toEqual({ type: "delete", paperId: "abc12345", requestId: "42" });
  });

  it("rejects an invalid paper ID or request ID", () => {
    expect(() => parseReadingHostMessage(envelope({ type: "delete", paperId: "../abc", requestId: "42" })))
      .toThrow("ReadingHostMessage.paperId");
    expect(() => parseReadingHostMessage(envelope({ type: "delete", paperId: "abc12345", requestId: "" })))
      .toThrow("ReadingHostMessage.requestId");
  });
});
