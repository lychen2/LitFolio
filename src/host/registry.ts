//! Frontend plugin host registry.
//!
//! Imports the SAME canonical `plugins/<id>/manifest.json` files the backend
//! embeds at compile time and validates them with the shared manifest parser.
//! One source of truth; no second manifest set.

import {
  pluginEntryLoaders,
  pluginRegistry,
  isPluginBuilt,
} from "./profileRegistry";
import {
  parsePluginManifestSetV1,
  type ContributionSlotV1,
  type PluginManifestV1,
} from "@/plugin-sdk/contracts";
import { invoke } from "@tauri-apps/api/core";
import { invokeParsed } from "@/lib/apiInvoke";
import { parseArray } from "@/lib/apiSchemaCore";

export { isPluginBuilt, pluginEntryLoaders, pluginRegistry };

export interface PluginHostEntry {
  manifest: PluginManifestV1;
  enabled: boolean;
  generation: number;
}

function parsePluginHostEntry(value: unknown, path: string): PluginHostEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path}: expected object`);
  }
  const record = value as Record<string, unknown>;
  return {
    manifest: parsePluginManifestSetV1([record.manifest])[0],
    enabled: record.enabled === true,
    generation: typeof record.generation === "number" ? record.generation : 0,
  };
}

export function listPlugins(): Promise<PluginHostEntry[]> {
  return invokeParsed<PluginHostEntry[]>(
    "plugin_host_list",
    undefined,
    (value, path) => parseArray(value, path, parsePluginHostEntry),
  );
}

/** Enable a plugin; returns the host-issued opaque binding for this run. */
export function enablePlugin(pluginId: string): Promise<{ bindingId: string }> {
  return invokeParsed<{ bindingId: string }>(
    "plugin_host_enable",
    { pluginId },
    (value, path) => {
      if (!value || typeof value !== "object") throw new Error(`${path}: expected object`);
      const bindingId = (value as Record<string, unknown>).bindingId;
      if (typeof bindingId !== "string" || !bindingId) throw new Error(`${path}.bindingId`);
      return { bindingId };
    },
  );
}

export function disablePlugin(pluginId: string): Promise<void> {
  return invoke<void>("plugin_host_disable", { pluginId });
}

/**
 * Contributions declared for a slot by ENABLED plugins only. Disabled or
 * unknown plugins contribute nothing — runtime hiding follows host state,
 * never the raw registry.
 */
export function contributionsForSlot(
  enabledIds: ReadonlySet<string>,
  slot: ContributionSlotV1,
): Array<{ pluginId: string; frontendExport: string; order: number }> {
  return pluginRegistry
    .filter((manifest) => enabledIds.has(manifest.id) && isPluginBuilt(manifest.id))
    .flatMap((manifest) =>
      manifest.contributions
        .filter((c) => c.slot === slot)
        .map((c) => ({
          pluginId: manifest.id,
          frontendExport: c.frontendExport,
          order: c.order,
        })),
    )
    .sort((a, b) => a.order - b.order);
}
