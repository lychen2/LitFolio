import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { FolderOpen, Loader2, RefreshCw } from "lucide-react";
import { api, type LlmConfig } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";

export function ObsidianSettings({
  draft,
  onChange,
}: {
  draft: LlmConfig;
  onChange: (next: LlmConfig) => void;
}) {
  const t = useT();
  const [result, setResult] = useState<string | null>(null);
  const config = draft.obsidian ?? { vault_dir: "", folder: "Papers" };

  const sync = useMutation({
    mutationFn: async () => {
      await api.llmSaveConfig(draft);
      return api.obsidianExportAll();
    },
    onSuccess: (summary) =>
      setResult(t("obsidian.syncDone", { exported: summary.exported, skipped: summary.skipped })),
    onError: () => setResult(null),
  });

  function update(patch: Partial<typeof config>) {
    onChange({ ...draft, obsidian: { ...config, ...patch } });
    setResult(null);
  }

  async function handleBrowse() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string" && selected) update({ vault_dir: selected });
  }

  return (
    <section className="litera-panel p-4 space-y-4">
      <div>
        <h3 className="text-sm font-medium text-litera-text flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-litera-accent" /> {t("obsidian.title")}
        </h3>
        <p className="text-xs text-litera-mute mt-1">{t("obsidian.description")}</p>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-wider text-litera-mute">{t("obsidian.vaultLabel")}</span>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={config.vault_dir}
            onChange={(event) => update({ vault_dir: event.target.value })}
            className="litera-input text-xs flex-1"
            placeholder={t("obsidian.vaultPlaceholder")}
          />
          <button onClick={handleBrowse} className="litera-btn text-xs" title={t("obsidian.browse")}>
            <FolderOpen className="h-3.5 w-3.5" />
            {t("obsidian.browse")}
          </button>
        </div>
      </label>

      <label className="flex flex-col gap-1 max-w-md">
        <span className="text-[11px] uppercase tracking-wider text-litera-mute">{t("obsidian.folderLabel")}</span>
        <input
          type="text"
          value={config.folder}
          onChange={(event) => update({ folder: event.target.value })}
          className="litera-input text-xs"
          placeholder="Papers"
        />
        <span className="text-[11px] text-litera-mute">{t("obsidian.folderHint")}</span>
      </label>

      <div className="flex items-center gap-3">
        <button
          onClick={() => sync.mutate()}
          disabled={sync.isPending || !config.vault_dir.trim()}
          className="litera-btn text-xs disabled:opacity-50"
        >
          {sync.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {t("obsidian.syncAll")}
        </button>
        <span className="text-[11px] text-litera-mute">{t("obsidian.saveHint")}</span>
      </div>
      {sync.error && <div className="text-sm text-litera-error">✕ {(sync.error as Error).message}</div>}
      {result && <div className="text-sm text-litera-accent">{result}</div>}
    </section>
  );
}
