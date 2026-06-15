import { describe, expect, it } from "vitest";
import { NAVIGATION_ITEMS } from "./navigationRegistry";

describe("navigation registry", () => {
  it("keeps all primary routes available to sidebar and command palette", () => {
    expect(NAVIGATION_ITEMS.map((item) => item.to)).toEqual([
      "/library",
      "/import",
      "/browse",
      "/feeds",
      "/candidates",
      "/projects",
      "/topic",
      "/ask",
      "/graph",
      "/settings",
    ]);
  });

  it("defines command-search keywords for every route", () => {
    expect(NAVIGATION_ITEMS.every((item) => item.keywords.length > 0)).toBe(true);
  });
});
