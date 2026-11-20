import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { XCircle, Puzzle } from "@/components/icons";
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
        <h2 className="flex items-center gap-2 font-medium text-litera-text">
          <Puzzle className="size-4 text-litera-accent2" aria-hidden="true" /> {t("settings.plugins.title")}
        </h2>
        <p className="text-xs text-litera-mute mt-1">{t("settings.plugins.subtitle")}</p>
      </div>
      {isLoading && <p className="text-xs text-litera-mute">{t("common.loading")}</p>}
      {error && <p className="text-sm text-litera-error"><XCircle className="mr-1 h-3.5 w-3.5 align-text-bottom" />{(error as Error).message}</p>}
      {toggle.error && <p className="text-sm text-litera-error"><XCircle className="mr-1 h-3.5 w-3.5 align-text-bottom" />{(toggle.error as Error).message}</p>}
      {!isLoading && !error && plugins.length === 0 && (
        <p className="text-xs text-litera-mute">{t("settings.plugins.empty")}</p>
      )}
      <ul className="divide-y divide-litera-border border-t border-litera-border">
        {plugins.map((entry) => (
          <li
            key={entry.manifest.id}
            className="flex items-center justify-between gap-3 py-3"
          >
            <div className="min-w-0">
              <div className="text-sm font-medium text-litera-text">{entry.manifest.displayName}</div>
              <div className="mt-1 truncate font-mono text-xs text-litera-mute">{entry.manifest.id}</div>
            </div>
            <label className="flex shrink-0 items-center gap-2 text-xs font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={entry.enabled}
                disabled={toggle.isPending}
                aria-label={entry.manifest.displayName}
                onChange={() => toggle.mutate({ id: entry.manifest.id, enabled: entry.enabled })}
                className="size-4 rounded-[var(--litera-radius-sm)] text-litera-accent focus:ring-litera-focus/40"
              />
              <span className={entry.enabled ? "text-litera-accent" : "text-litera-mute"}>
                {entry.enabled ? t("settings.plugins.enabled") : t("settings.plugins.disabled")}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
