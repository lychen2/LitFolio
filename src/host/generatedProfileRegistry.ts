import candidate_inbox from "../../plugins/candidate-inbox/manifest.json";
import discovery_feeds from "../../plugins/discovery-feeds/manifest.json";
import fixture_local from "../../plugins/fixture-local/manifest.json";
import literature_network from "../../plugins/literature-network/manifest.json";
import updates from "../../plugins/updates/manifest.json";
import { pluginRoutes as candidate_inbox_routes } from "@/plugins/candidate-inbox/index";
import { pluginRoutes as discovery_feeds_routes } from "@/plugins/discovery-feeds/index";
import { pluginRoutes as literature_network_routes } from "@/plugins/literature-network/index";

import type { PluginRoute } from "./pluginTypes";

export const selectedManifests = [candidate_inbox,
  discovery_feeds,
  fixture_local,
  literature_network,
  updates] as const;
export const selectedPluginRoutes: Readonly<Record<string, readonly PluginRoute[]>> = {
  "candidate-inbox": candidate_inbox_routes,
  "discovery-feeds": discovery_feeds_routes,
  "literature-network": literature_network_routes,
};
export const selectedProfile = "all";
