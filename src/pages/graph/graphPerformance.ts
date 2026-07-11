export type GraphRenderMode = "full" | "large" | "dense";
export type GraphLabelMode = "all" | "selected";

export interface GraphRenderProfile {
  mode: GraphRenderMode;
  labelMode: GraphLabelMode;
  showArrowheads: boolean;
  linkDistance: number;
  chargeStrength: number;
  chargeDistanceMax: number;
  collideRadius: number;
  alphaDecay: number;
  velocityDecay: number;
  warmupTicks: number;
  cooldownTicks: number;
}

export function graphRenderProfile({
  nodeCount,
  edgeCount,
}: {
  nodeCount: number;
  edgeCount: number;
}): GraphRenderProfile {
  if (nodeCount >= 1000 || edgeCount >= 2500) {
    return {
      mode: "dense",
      labelMode: "selected",
      showArrowheads: false,
      linkDistance: 80,
      chargeStrength: -90,
      chargeDistanceMax: 180,
      collideRadius: 12,
      alphaDecay: 0.09,
      velocityDecay: 0.55,
      warmupTicks: 0,
      cooldownTicks: 40,
    };
  }

  if (nodeCount >= 500 || edgeCount >= 1200) {
    return {
      mode: "large",
      labelMode: "selected",
      showArrowheads: false,
      linkDistance: 110,
      chargeStrength: -180,
      chargeDistanceMax: 280,
      collideRadius: 18,
      alphaDecay: 0.06,
      velocityDecay: 0.48,
      warmupTicks: 25,
      cooldownTicks: 90,
    };
  }

  return {
    mode: "full",
    labelMode: "all",
    showArrowheads: true,
    linkDistance: 150,
    chargeStrength: -450,
    chargeDistanceMax: 500,
    collideRadius: 30,
    alphaDecay: 0.028,
    velocityDecay: 0.4,
    warmupTicks: 100,
    cooldownTicks: 300,
  };
}
