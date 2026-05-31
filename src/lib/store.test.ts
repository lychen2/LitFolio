import { describe, expect, it } from "vitest";
import { mergeThreePane } from "./store";

describe("mergeThreePane", () => {
  it("updates only provided pane widths", () => {
    expect(mergeThreePane({ listW: 280, notesW: 380 }, { listW: 320 })).toEqual({
      listW: 320,
      notesW: 380,
    });
  });

  it("returns a new object without mutating the current state", () => {
    const current = { listW: 280, notesW: 380 };
    const merged = mergeThreePane(current, { notesW: 420 });

    expect(merged).toEqual({ listW: 280, notesW: 420 });
    expect(merged).not.toBe(current);
    expect(current).toEqual({ listW: 280, notesW: 380 });
  });
});
