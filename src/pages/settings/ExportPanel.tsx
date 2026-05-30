import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";

export function ExportPanel() {
  const t = useT();
  const { data: exportDir, refetch } = useQuery({
    queryKey: ["exportDir"],
    queryFn: api.exportMarkdownDir,
  });
  const [result, setResult] = useState<string | null>(null);

  const setDir = useMutation({
    mutationFn: (dir: string) => api.exportMarkdownSetDir(dir),
    onSuccess: () => {
      refetch();
      setResult(null);
    },
  });
  const exportAll = useMutation({
    mutationFn: (incremental: boolean) => api.exportMarkdownAll(incremental),
    onSuccess: (data) => setResult(t("export.done", { exported: data.exported, skipped: data.skipped })),
  });

  async function handleBrowse() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string" && selected) setDir.mutate(selected);
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-medium text-litera-text mb-1">{t("export.title")}</h3>
        <p className="text-xs text-litera-mute">{t("export.subtitle")}</p>
      </div>
      <div className="space-y-2">
        <label className="text-xs text-litera-mute">{t("export.dirLabel")}</label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={exportDir ?? ""}
            readOnly
            placeholder={t("export.dirPlaceholder")}
            className="flex-1 px-3 py-1.5 text-sm bg-litera-panel border border-litera-line rounded-md text-litera-text placeholder:text-litera-mute"
          />
          <button onClick={handleBrowse} className="litera-btn text-xs">{t("export.browse")}</button>
        </div>
        <p className="text-[11px] text-litera-mute">{t("export.dirHint")}</p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => exportAll.mutate(false)}
          disabled={exportAll.isPending || !exportDir}
          className="litera-btn-primary text-xs disabled:opacity-50"
        >
          {exportAll.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          {t("export.exportAll")}
        </button>
        <button
          onClick={() => exportAll.mutate(true)}
          disabled={exportAll.isPending || !exportDir}
          className="litera-btn text-xs disabled:opacity-50"
        >
          {t("export.exportIncremental")}
        </button>
      </div>
      {exportAll.error && <div className="text-sm text-red-400/90">✕ {(exportAll.error as Error).message}</div>}
      {result && <div className="text-sm text-litera-accent">{result}</div>}
      {!exportDir && <div className="text-xs text-litera-mute">{t("export.noDir")}</div>}
    </div>
  );
}
