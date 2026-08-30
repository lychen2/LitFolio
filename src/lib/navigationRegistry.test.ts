import { describe, expect, it } from "vitest";
import { NAVIGATION_GROUPS, NAVIGATION_ITEMS, visibleNavigation } from "./navigationRegistry";

describe("navigation registry", () => {
  it("keeps all primary routes available to sidebar and command palette", () => {
    expect(NAVIGATION_ITEMS.map((item) => item.to)).toEqual([
      "/library",
      "/import",
      "/candidates",
      "/browse",
      "/feeds",
      "/topic",
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
    expect(new Set(groupedPaths).size).toBe(groupedPaths.length);
    expect(groupedPaths).toEqual(NAVIGATION_ITEMS.map((item) => item.to));
  });

  it("hides plugin routes until the host has enabled them", () => {
    const hidden = visibleNavigation(undefined);
    expect(hidden.items.map((item) => item.to)).toEqual(["/library", "/import", "/settings"]);
    expect(hidden.groups.map((group) => group.id)).toEqual(["library", "system"]);

    const askOnly = visibleNavigation(new Set(["library-ask"]));
    expect(askOnly.items.map((item) => item.to)).toEqual([
      "/library",
      "/import",
      "/ask",
      "/settings",
    ]);
    expect(askOnly.groups.map((group) => group.id)).toEqual(["library", "research", "system"]);
  });
});
