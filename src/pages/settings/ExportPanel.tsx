import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import { XCircle, Download, Spinner } from "@/components/icons";
import { Button, Input } from "@/components/ui";
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
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string" && selected) setDir.mutate(selected);
  }

  return (
    <section className="litera-panel space-y-4 p-4">
      <div>
        <h2 className="flex items-center gap-2 font-medium text-litera-text">
          <Download className="size-4 text-litera-accent2" aria-hidden="true" />
          {t("export.title")}
        </h2>
        <p className="mt-1 text-xs text-litera-mute">{t("export.subtitle")}</p>
      </div>
      <div className="space-y-2">
        <label htmlFor="settings-export-directory" className="block text-xs font-medium text-litera-mute">{t("export.dirLabel")}</label>
        <div className="flex items-center gap-2">
          <Input
            id="settings-export-directory"
            type="text"
            value={exportDir ?? ""}
            readOnly
            placeholder={t("export.dirPlaceholder")}
            className="min-w-0 flex-1"
          />
          <Button size="sm" onClick={handleBrowse}>{t("export.browse")}</Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          size="sm"
          onClick={() => exportAll.mutate(false)}
          disabled={exportAll.isPending || !exportDir}
          className="disabled:opacity-50"
        >
          {exportAll.isPending ? <Spinner className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          {t("export.exportAll")}
        </Button>
        <Button
          size="sm"
          onClick={() => exportAll.mutate(true)}
          disabled={exportAll.isPending || !exportDir}
          className="disabled:opacity-50"
        >
          {t("export.exportIncremental")}
        </Button>
      </div>
      {exportAll.error && <div role="alert" className="text-sm text-litera-error"><XCircle className="mr-1 size-4 align-text-bottom" />{exportAll.error.message}</div>}
      {result && <div role="status" className="text-sm text-litera-success">{result}</div>}
      {!exportDir && <div className="text-xs text-litera-mute">{t("export.noDir")}</div>}
    </section>
  );
}
