import { describe, expect, it } from "vitest";
import { NAVIGATION_GROUPS, NAVIGATION_ITEMS } from "./navigationRegistry";

describe("navigation registry", () => {
  it("keeps all primary routes available to sidebar and command palette", () => {
    expect(NAVIGATION_ITEMS.map((item) => item.to)).toEqual([
      "/library",
      "/import",
      "/candidates",
      "/browse",
      "/feeds",
      "/topic",
      "/projects",
      "/compare",
      "/ask",
      "/graph",
      "/settings",
    ]);
  });

  it("defines command-search keywords for every route", () => {
    expect(NAVIGATION_ITEMS.every((item) => item.keywords.length > 0)).toBe(true);
  });

  it("assigns every route to exactly one navigation group", () => {
    const groupedPaths = NAVIGATION_GROUPS.flatMap((group) => group.paths);
    expect(groupedPaths).toEqual(NAVIGATION_ITEMS.map((item) => item.to));
    expect(new Set(groupedPaths).size).toBe(groupedPaths.length);
  });
});
