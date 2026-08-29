//! Route-level plugin gate: renders children only while the owning plugin is
//! enabled. Disabled or unknown plugins get an explicit notice — never a
//! silent blank page.

import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useT } from "@/i18n/I18nProvider";
import { listPlugins } from "./registry";

export function PluginGate({
  pluginId,
  children,
}: {
  pluginId: string;
  children: React.ReactNode;
}) {
  const t = useT();
  const { data, isLoading } = useQuery({
    queryKey: ["plugin-host", "list"],
    queryFn: listPlugins,
    staleTime: 5_000,
  });
  if (isLoading) return null;
  const enabled = (data ?? []).some((e) => e.manifest.id === pluginId && e.enabled);
  if (!enabled) {
    const name = (data ?? []).find((e) => e.manifest.id === pluginId)?.manifest.displayName ?? pluginId;
    return (
      <div className="grid h-full place-items-center px-6 text-center text-sm text-litera-mute">
        <div className="space-y-3">
          <p>{t("plugins.disabled", { name })}</p>
          <Link to="/settings?tab=plugins" className="text-litera-accent hover:underline">
            {t("plugins.openSettings")}
          </Link>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
