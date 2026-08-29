import { describe, expect, it } from "vitest";
import { contributionsForSlot, pluginRegistry } from "./registry";

describe("frontend plugin registry", () => {
  it("validates the canonical embedded manifest set", () => {
    expect(pluginRegistry.map((m) => m.id)).toContain("fixture-local");
    const fixture = pluginRegistry.find((m) => m.id === "fixture-local")!;
    expect(fixture.coreApi).toBe("^1.0.0");
  });

  it("contributes only for enabled plugins", () => {
    const enabled = new Set(["fixture-local"]);
    expect(contributionsForSlot(enabled, "library.toolbarActions")).toEqual([
      { pluginId: "fixture-local", frontendExport: "renderToolbarButton", order: 0 },
    ]);
  });

  it("disabled or unknown plugins contribute nothing", () => {
    expect(contributionsForSlot(new Set(), "library.toolbarActions")).toEqual([]);
    expect(
      contributionsForSlot(new Set(["some-other-plugin"]), "library.toolbarActions"),
    ).toEqual([]);
  });

  it("never contributes to slots the manifest did not request", () => {
    const enabled = new Set(["fixture-local"]);
    expect(contributionsForSlot(enabled, "reader.sidePanels")).toEqual([]);
    expect(contributionsForSlot(enabled, "settings.sections")).toEqual([]);
  });
});
