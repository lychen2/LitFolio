import { describe, expect, it } from "vitest";
import { nextSectionDraft } from "./noteSectionState";

describe("nextSectionDraft", () => {
  it("accepts empty reading-card content as a real value", () => {
    expect(nextSectionDraft({ currentDraft: "old", incomingContent: "", dirty: false })).toBe("");
  });

  it("recovers from external content changes when the field is not dirty", () => {
    expect(nextSectionDraft({ currentDraft: "old", incomingContent: "restored", dirty: false })).toBe("restored");
  });

  it("does not overwrite a dirty local draft", () => {
    expect(nextSectionDraft({ currentDraft: "local edit", incomingContent: "remote", dirty: true })).toBe("local edit");
  });
});
