import { useEffect, useState, type ComponentType } from "react";
import { useLocation } from "react-router-dom";
import { PluginGate } from "./PluginGate";
import { pluginEntryLoaders } from "./registry";
import type { PluginRoute } from "./pluginTypes";

interface LoadedRoute extends PluginRoute {
  pluginId: string;
}

export function PluginRouteHost() {
  const location = useLocation();
  const [routes, setRoutes] = useState<LoadedRoute[]>([]);

  useEffect(() => {
    let mounted = true;
    Promise.all(
      Object.entries(pluginEntryLoaders).map(async ([pluginId, load]) => {
        const entry = await load();
        return (entry.pluginRoutes ?? []).map((route) => ({ ...route, pluginId }));
      }),
    )
      .then((groups) => {
        if (mounted) setRoutes(groups.flat());
      })
      .catch(() => {
        if (mounted) setRoutes([]);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const route = routes.find(
    (candidate) =>
      location.pathname === candidate.path || location.pathname.startsWith(`${candidate.path}/`),
  );
  if (!route) return null;

  const Component = route.component as ComponentType;
  return (
    <PluginGate pluginId={route.pluginId}>
      <Component />
    </PluginGate>
  );
}
