import { lazy } from "react";
import type { PluginRoute } from "@/host/pluginTypes";

// Profile registration reads the route without loading the page.
const CandidateInboxPage = lazy(() => import("@/pages/CandidateInboxPage").then((module) => ({ default: module.CandidateInboxPage })));

export const pluginRoutes: readonly PluginRoute[] = [
  { path: "/candidates", component: CandidateInboxPage },
];

export function activateCandidateInbox() {
  return { pluginId: "candidate-inbox", deactivate: () => undefined };
}
