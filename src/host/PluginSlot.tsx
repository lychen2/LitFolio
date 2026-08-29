//! Renders plugin contributions into host slots.
//!
//! Only ENABLED plugins (per plugin_host_list) contribute; the raw registry
//! never renders by itself. Contribution components are resolved from the
//! owning plugin's module — a missing export is a host error, not silent.

import { useQuery } from "@tanstack/react-query";
import { contributionsForSlot, listPlugins, type PluginHostEntry } from "./registry";
import type { ContributionSlotV1 } from "@/plugin-sdk/contracts";

export function useEnabledPluginIds(): {
  data: Set<string> | undefined;
  isLoading: boolean;
} {
  const query = useQuery({
    queryKey: ["plugin-host", "list"],
    queryFn: listPlugins,
    staleTime: 5_000,
  });
  const enabled = new Set(
    (query.data ?? []).filter((e) => e.enabled).map((e) => e.manifest.id),
  );
  return { data: query.isLoading ? undefined : enabled, isLoading: query.isLoading };
}

interface SlotRendererProps {
  slot: ContributionSlotV1;
  render: (contribution: { pluginId: string; frontendExport: string }) => React.ReactNode;
}

/**
 * Host-side slot renderer. The `render` callback maps a contribution to its
 * component; it must return null for exports the host bundle does not carry
 * (build-pruned plugins contribute nothing at runtime).
 */
export function PluginSlot({ slot, render }: SlotRendererProps): React.ReactNode {
  const { data: enabled } = useEnabledPluginIds();
  if (!enabled) return null;
  return (
    <>
      {contributionsForSlot(enabled, slot).map((c) => (
        <span key={`${c.pluginId}:${c.frontendExport}`} data-plugin-slot={slot}>
          {render(c)}
        </span>
      ))}
    </>
  );
}

export type { PluginHostEntry };
