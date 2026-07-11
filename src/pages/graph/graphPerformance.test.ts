import { describe, expect, it } from "vitest";
import { graphRenderProfile } from "./graphPerformance";

describe("graphRenderProfile", () => {
  it("keeps full rendering for small graphs", () => {
    const profile = graphRenderProfile({ nodeCount: 100, edgeCount: 200 });

    expect(profile.mode).toBe("full");
    expect(profile.labelMode).toBe("all");
    expect(profile.showArrowheads).toBe(true);
    expect(profile.warmupTicks).toBe(100);
  });

  it("uses large graph settings at 500 nodes", () => {
    const profile = graphRenderProfile({ nodeCount: 500, edgeCount: 800 });

    expect(profile.mode).toBe("large");
    expect(profile.labelMode).toBe("selected");
    expect(profile.showArrowheads).toBe(false);
    expect(profile.cooldownTicks).toBeLessThan(300);
  });

  it("uses dense graph settings at 1000 nodes", () => {
    const profile = graphRenderProfile({ nodeCount: 1000, edgeCount: 1200 });

    expect(profile.mode).toBe("dense");
    expect(profile.labelMode).toBe("selected");
    expect(profile.warmupTicks).toBe(0);
    expect(profile.chargeDistanceMax).toBeLessThan(500);
  });

  it("uses dense graph settings for very high edge counts", () => {
    const profile = graphRenderProfile({ nodeCount: 300, edgeCount: 2500 });

    expect(profile.mode).toBe("dense");
  });
});
