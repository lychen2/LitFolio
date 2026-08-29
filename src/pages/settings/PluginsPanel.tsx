import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Puzzle } from "lucide-react";
import { disablePlugin, enablePlugin, isPluginBuilt, listPlugins } from "@/host/registry";
import { useT } from "@/i18n/I18nProvider";

const PLUGIN_LIST_KEY = ["plugin-host", "list"] as const;

export function PluginsPanel() {
  const t = useT();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: PLUGIN_LIST_KEY,
    queryFn: listPlugins,
  });
  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      enabled ? disablePlugin(id) : enablePlugin(id).then(() => undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: PLUGIN_LIST_KEY }),
  });

  const plugins = (data ?? []).filter(
    (entry) => isPluginBuilt(entry.manifest.id) && !entry.manifest.id.startsWith("fixture-"),
  );

  return (
    <section className="litera-panel p-4 space-y-4">
      <div>
        <h3 className="text-sm font-medium text-litera-text flex items-center gap-2">
          <Puzzle className="h-4 w-4 text-litera-accent" /> {t("settings.plugins.title")}
        </h3>
        <p className="text-xs text-litera-mute mt-1">{t("settings.plugins.subtitle")}</p>
      </div>
      {isLoading && <p className="text-xs text-litera-mute">{t("common.loading")}</p>}
      {error && <p className="text-sm text-litera-error">✕ {(error as Error).message}</p>}
      {toggle.error && <p className="text-sm text-litera-error">✕ {(toggle.error as Error).message}</p>}
      {!isLoading && !error && plugins.length === 0 && (
        <p className="text-xs text-litera-mute">{t("settings.plugins.empty")}</p>
      )}
      <ul className="space-y-2">
        {plugins.map((entry) => (
          <li
            key={entry.manifest.id}
            className="flex items-center justify-between gap-3 rounded-[var(--litera-radius)] border border-litera-line px-3 py-2"
          >
            <div className="min-w-0">
              <div className="text-sm text-litera-text">{entry.manifest.displayName}</div>
              <div className="truncate font-mono text-[11px] text-litera-mute">{entry.manifest.id}</div>
            </div>
            <label className="flex shrink-0 items-center gap-2 text-xs text-litera-mute">
              <input
                type="checkbox"
                checked={entry.enabled}
                disabled={toggle.isPending}
                onChange={() => toggle.mutate({ id: entry.manifest.id, enabled: entry.enabled })}
              />
              {entry.enabled ? t("settings.plugins.enabled") : t("settings.plugins.disabled")}
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
