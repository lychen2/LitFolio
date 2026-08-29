import { selectedManifests, selectedPluginLoaders } from "./generatedProfileRegistry";
import { parsePluginManifestSetV1, type PluginManifestV1 } from "@/plugin-sdk/contracts";
import type { FrontendPluginEntry } from "./pluginTypes";

export const pluginRegistry: PluginManifestV1[] = parsePluginManifestSetV1([
  ...selectedManifests,
]);

export const pluginEntryLoaders: Record<string, () => Promise<FrontendPluginEntry>> = selectedPluginLoaders;

export function isPluginBuilt(pluginId: string): boolean {
  return pluginRegistry.some((manifest) => manifest.id === pluginId);
}
