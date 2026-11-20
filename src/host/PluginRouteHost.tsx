import { useLocation } from "react-router-dom";
import { PluginGate } from "./PluginGate";
import { selectedPluginRoutes } from "./generatedProfileRegistry";

const routes = Object.entries(selectedPluginRoutes).flatMap(([pluginId, pluginRoutes]) =>
  pluginRoutes.map((route) => ({ ...route, pluginId })),
);

export function PluginRouteHost() {
  const location = useLocation();

  const route = routes.find(
    (candidate) =>
      location.pathname === candidate.path || location.pathname.startsWith(`${candidate.path}/`),
  );
  if (!route) return null;

  const Component = route.component;
  return (
    <PluginGate pluginId={route.pluginId}>
      <Component />
    </PluginGate>
  );
}
