import candidate_inbox from "../../plugins/candidate-inbox/manifest.json";
import discovery_feeds from "../../plugins/discovery-feeds/manifest.json";
import document_services from "../../plugins/document-services/manifest.json";
import fixture_local from "../../plugins/fixture-local/manifest.json";
import knowledge_graph from "../../plugins/knowledge-graph/manifest.json";
import library_ask from "../../plugins/library-ask/manifest.json";
import library_plus from "../../plugins/library-plus/manifest.json";
import research_workbench from "../../plugins/research-workbench/manifest.json";
import source_connectors from "../../plugins/source-connectors/manifest.json";
import sync_integrations from "../../plugins/sync-integrations/manifest.json";
import updates from "../../plugins/updates/manifest.json";

import type { FrontendPluginEntry } from "./pluginTypes";

export const selectedManifests = [candidate_inbox,
  discovery_feeds,
  document_services,
  fixture_local,
  knowledge_graph,
  library_ask,
  library_plus,
  research_workbench,
  source_connectors,
  sync_integrations,
  updates] as const;
export const selectedPluginLoaders: Record<string, () => Promise<FrontendPluginEntry>> = {
  "candidate-inbox": () => import("@/plugins/candidate-inbox/index"),
  "discovery-feeds": () => import("@/plugins/discovery-feeds/index"),
  "document-services": () => import("@/plugins/document-services/index"),
  "fixture-local": () => import("@/plugins/fixture-local/index"),
  "knowledge-graph": () => import("@/plugins/knowledge-graph/index"),
  "library-ask": () => import("@/plugins/library-ask/index"),
  "library-plus": () => import("@/plugins/library-plus/index"),
  "research-workbench": () => import("@/plugins/research-workbench/index"),
  "source-connectors": () => import("@/plugins/source-connectors/index"),
  "sync-integrations": () => import("@/plugins/sync-integrations/index"),
  "updates": () => import("@/plugins/updates/index"),
};
export const selectedProfile = "all";
