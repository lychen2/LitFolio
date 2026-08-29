import { CandidateInboxPage } from "@/pages/CandidateInboxPage";
import type { FrontendPluginEntry } from "@/host/pluginTypes";

export const pluginRoutes: FrontendPluginEntry["pluginRoutes"] = [
  { path: "/candidates", component: CandidateInboxPage },
];

export function activateCandidateInbox() {
  return { pluginId: "candidate-inbox", deactivate: () => undefined };
}
