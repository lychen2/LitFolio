import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, FolderOpen, Loader2, Radio, Save } from "lucide-react";
import { api, type ZoteroConfig } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";

const EMPTY_CONFIG: ZoteroConfig = { target_id: null, target_name: null };

export function ZoteroPanel() {
  const t = useT();
  const config = useQuery({
    queryKey: ["zotero", "config"],
    queryFn: api.zoteroGetConfig,
  });
  const targets = useQuery({
    queryKey: ["zotero", "targets"],
    queryFn: api.zoteroListTargets,
    enabled: false,
  });
  const [draft, setDraft] = useState<ZoteroConfig>(EMPTY_CONFIG);
  const [status, setStatus] = useState<string | null>(null);
  useEffect(() => {
    if (config.data) setDraft(config.data);
  }, [config.data]);

  const save = useMutation({
    mutationFn: api.zoteroSaveConfig,
    onSuccess: () => {
      setStatus(t("settings.zotero.saved"));
      void config.refetch();
    },
    onError: (error) => setStatus(String(error)),
  });
  const test = useMutation({
    mutationFn: api.zoteroTest,
    onSuccess: () => setStatus(t("settings.zotero.connected")),
    onError: (error) => setStatus(String(error)),
  });

  async function loadTargets() {
    setStatus(null);
    try {
      await targets.refetch();
    } catch (error) {
      setStatus(String(error));
    }
  }

  function selectTarget(id: string) {
    const target = targets.data?.find((item) => item.id === id);
    setDraft({ target_id: id, target_name: target?.name ?? null });
    setStatus(null);
  }

  const busy = config.isLoading || save.isPending || test.isPending || targets.isFetching;
  return (
    <section className="litera-panel p-5 mt-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-litera-text font-medium mb-1 flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-litera-accent2" /> {t("settings.zotero.title")}
          </h2>
          <p className="text-xs text-litera-mute">{t("settings.zotero.hint")}</p>
        </div>
        <button
          type="button"
          onClick={() => test.mutate()}
          disabled={busy}
          className="litera-btn text-xs disabled:opacity-50"
        >
          {test.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Radio className="h-3.5 w-3.5" />}
          {t("settings.zotero.test")}
        </button>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1">
          <span className="mb-1 block text-xs text-litera-mute">{t("settings.zotero.target")}</span>
          <select
            value={draft.target_id ?? ""}
            onChange={(event) => selectTarget(event.target.value)}
            className="litera-input w-full text-sm"
            disabled={busy || targets.data === undefined}
          >
            <option value="">{targets.data === undefined ? t("settings.zotero.loadFirst") : t("settings.zotero.choose")}</option>
            {targets.data?.map((target) => (
              <option key={target.id} value={target.id}>
                {"　".repeat(Math.max(0, target.level - 1))}{target.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={loadTargets} disabled={busy} className="litera-btn text-xs disabled:opacity-50">
          {targets.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderOpen className="h-3.5 w-3.5" />}
          {t("settings.zotero.loadTargets")}
        </button>
        <button
          type="button"
          onClick={() => save.mutate(draft)}
          disabled={busy || !draft.target_id}
          className="litera-btn-primary text-xs disabled:opacity-50"
        >
          {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {t("settings.zotero.save")}
        </button>
      </div>
      {draft.target_name && <div className="mt-2 text-xs text-litera-mute">{draft.target_name}</div>}
      {status && <div className="mt-3 flex items-center gap-2 text-xs text-litera-mute" role="status"><CheckCircle2 className="h-3.5 w-3.5" />{status}</div>}
      {config.error && <div className="mt-3 text-xs text-litera-error">{String(config.error)}</div>}
    </section>
  );
}
