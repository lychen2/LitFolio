import { ComparePage } from "@/pages/ComparePage";
import { ProjectsPage } from "@/pages/ProjectsPage";
import type { FrontendPluginEntry } from "@/host/pluginTypes";

export const pluginRoutes: FrontendPluginEntry["pluginRoutes"] = [
  { path: "/projects", component: ProjectsPage },
  { path: "/compare", component: ComparePage },
];

export function activateResearchWorkbench() {
  return { pluginId: "research-workbench", deactivate: () => undefined };
}
