import type { ComponentType } from "react";

export interface PluginRoute {
  path: string;
  component: ComponentType;
}
