import { describe, expect, it } from "vitest";

import type { ReadingHostAction } from "@/lib/apiReadingService";
import { planLibraryAction } from "./LibraryHostActions";

function action(partial: Omit<ReadingHostAction, "type">): ReadingHostAction {
  return { type: "action", ...partial };
}

describe("planLibraryAction", () => {
  it("opens a single-paper surface for each paper tool", () => {
    expect(planLibraryAction(action({ action: "tldr", paperIds: ["p1"] }))).toEqual({
      surface: "tldr",
      paperId: "p1",
    });
    expect(planLibraryAction(action({ action: "quick-read", paperIds: ["p1"] }))).toEqual({
      surface: "quick-read",
      paperId: "p1",
    });
    expect(planLibraryAction(action({ action: "translate-metadata", paperIds: ["p1"] }))).toEqual({
      surface: "translate-metadata",
      paperId: "p1",
    });
    expect(planLibraryAction(action({ action: "similar", paperIds: ["p1"] }))).toEqual({
      surface: "similar",
      paperId: "p1",
    });
    expect(planLibraryAction(action({ action: "details", paperIds: ["p1"] }))).toEqual({
      surface: "details",
      paperId: "p1",
    });
  });

  it("keeps the whole selection for batch tools", () => {
    const paperIds = ["p1", "p2", "p3"];
    for (const batch of ["review", "export", "zotero", "queue-add"] as const) {
      expect(planLibraryAction(action({ action: batch, paperIds }))).toEqual({ surface: batch, paperIds });
    }
  });

  it("routes reader-owned panels to the reader without consuming a paper ID", () => {
    for (const panel of ["terms", "notes", "highlights", "cached", "pdf"] as const) {
      expect(planLibraryAction(action({ action: panel, paperIds: ["p1", "p2"] }))).toEqual({
        surface: "reader",
        paperId: "p1",
      });
    }
  });

  it("plans the panels that need no paper and the selection translation", () => {
    expect(planLibraryAction(action({ action: "queue-open", paperIds: [] }))).toEqual({ surface: "queue-open" });
    expect(planLibraryAction(action({ action: "collections", paperIds: [] }))).toEqual({ surface: "collections" });
    expect(planLibraryAction(action({ action: "selection-translate", paperIds: ["p1"], text: "  quote  " })))
      .toEqual({ surface: "selection-translate", paperId: "p1", text: "quote" });
  });

  it("rejects plans the surface cannot honour", () => {
    expect(() => planLibraryAction(action({ action: "tldr", paperIds: [] }))).toThrow(/needs a paper ID/);
    expect(() => planLibraryAction(action({ action: "review", paperIds: [] }))).toThrow(/needs paper IDs/);
    expect(() => planLibraryAction(action({ action: "selection-translate", paperIds: ["p1"], text: "   " })))
      .toThrow(/selected text/);
    expect(() => planLibraryAction(action({ action: "selection-translate", paperIds: [], text: "quote" })))
      .toThrow(/paper ID and selected text/);
  });
});
