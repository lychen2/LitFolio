import { selectedManifests } from "./generatedProfileRegistry";
import { parsePluginManifestSetV1, type PluginManifestV1 } from "@/plugin-sdk/contracts";

export const pluginRegistry: PluginManifestV1[] = parsePluginManifestSetV1([
  ...selectedManifests,
]);

export function isPluginBuilt(pluginId: string): boolean {
  return pluginRegistry.some((manifest) => manifest.id === pluginId);
}
