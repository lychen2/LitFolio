import { describe, expect, it } from "vitest";
import { toggleLibrarySelection } from "./librarySelection";

describe("toggleLibrarySelection", () => {
  it("keeps selection by paper id across virtual list windows", () => {
    const selected = new Set(["paper-002", "paper-250"]);

    const next = toggleLibrarySelection(selected, "paper-999");

    expect([...next].sort()).toEqual(["paper-002", "paper-250", "paper-999"]);
    expect([...selected].sort()).toEqual(["paper-002", "paper-250"]);
  });

  it("removes an already selected paper id without touching other windows", () => {
    const selected = new Set(["paper-002", "paper-250", "paper-999"]);

    expect([...toggleLibrarySelection(selected, "paper-250")].sort()).toEqual(["paper-002", "paper-999"]);
  });
});
