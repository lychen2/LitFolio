import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Folder, Loader2, Upload } from "lucide-react";
import { api, pickPdfFiles } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";

type ImportResult = { ok: number; failed: { path: string; error: string }[] };
type FolderProgress = { phase: string; done: number; total: number; current: string; failed: number };
type FolderProgressPayload = Omit<FolderProgress, "current"> & { current_file: string };

export function PdfTab() {
  const t = useT();
  const qc = useQueryClient();
  const [picked, setPicked] = useState<string[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [folderProgress, setFolderProgress] = useState<FolderProgress | null>(null);

  const m = useMutation({
    mutationFn: (paths: string[]) => api.importPdfFiles(paths),
    onSuccess: (s) => {
      setResult({ ok: s.imported.length, failed: s.failed });
      setPicked([]);
      qc.invalidateQueries({ queryKey: ["papers"] });
    },
    onError: (e: Error) => setResult({ ok: 0, failed: [{ path: "(all)", error: e.message }] }),
  });
  const folderMut = useFolderImportMutation(setFolderProgress, setResult);

  async function pick() {
    const files = await pickPdfFiles();
    if (files && files.length) setPicked(files);
  }

  async function pickFolder() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string" && selected) folderMut.mutate(selected);
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="litera-panel p-8 text-center">
        <Upload className="h-10 w-10 mx-auto mb-3 text-litera-mute" />
        <p className="text-sm text-litera-text">{t("import.pdfTab.desc")}</p>
        <p className="text-xs text-litera-mute mt-1">{t("import.pdfTab.hint", { path: "papers/<id>/original.pdf" })}</p>
        <PdfPickActions
          pickedCount={picked.length}
          filePending={m.isPending}
          folderPending={folderMut.isPending}
          onPick={pick}
          onPickFolder={pickFolder}
          onImport={() => m.mutate(picked)}
        />
        {folderProgress && <FolderProgressView progress={folderProgress} />}
        {picked.length > 0 && <PickedFiles paths={picked} />}
        <p className="mt-4 text-xs text-litera-mute">{t("import.pdfTab.dragHint")}</p>
      </div>
      {result && <ImportResultView result={result} />}
    </div>
  );
}

function useFolderImportMutation(
  setFolderProgress: (progress: FolderProgress | null) => void,
  setResult: (result: ImportResult) => void,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dirPath: string) => {
      const { listen } = await import("@tauri-apps/api/event");
      const unlisten = await listen<FolderProgressPayload>("folder-import-progress", (e) => {
        const p = e.payload;
        setFolderProgress({ phase: p.phase, done: p.done, total: p.total, current: p.current_file, failed: p.failed });
      });
      try {
        return await api.importFolder(dirPath);
      } finally {
        unlisten();
      }
    },
    onSuccess: (s) => {
      setResult({ ok: s.imported.length, failed: s.failed });
      setFolderProgress(null);
      qc.invalidateQueries({ queryKey: ["papers"] });
    },
    onError: (e: Error) => {
      setResult({ ok: 0, failed: [{ path: "(folder)", error: e.message }] });
      setFolderProgress(null);
    },
  });
}

function PdfPickActions({
  pickedCount, filePending, folderPending, onPick, onPickFolder, onImport,
}: {
  pickedCount: number;
  filePending: boolean;
  folderPending: boolean;
  onPick: () => void;
  onPickFolder: () => void;
  onImport: () => void;
}) {
  const t = useT();
  return (
    <div className="mt-4 flex items-center justify-center gap-2">
      <button onClick={onPick} className="litera-btn">
        <Upload className="h-4 w-4" /> {t("import.pdfTab.pick")}
      </button>
      <button onClick={onPickFolder} disabled={folderPending} className="litera-btn disabled:opacity-50">
        <Folder className="h-4 w-4" /> {t("import.pdfTab.pickFolder")}
      </button>
      {pickedCount > 0 && (
        <button onClick={onImport} disabled={filePending} className="litera-btn-primary disabled:opacity-50">
          {filePending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          {t("import.pdfTab.importBtn", { count: String(pickedCount) })}
        </button>
      )}
    </div>
  );
}

function FolderProgressView({ progress }: { progress: FolderProgress }) {
  const t = useT();
  return (
    <div className="mt-3 text-xs text-litera-mute">
      {progress.phase === "scanning"
        ? t("import.pdfTab.folderScanning")
        : progress.phase === "done"
        ? t("import.pdfTab.done", { ok: String(progress.done) })
        : t("import.pdfTab.folderProgress", { done: String(progress.done), total: String(progress.total) })}
      {progress.current && <span className="ml-2 font-mono truncate">{progress.current}</span>}
      {progress.total > 0 && progress.phase !== "done" && (
        <div className="mt-1 h-1.5 bg-litera-line rounded-full overflow-hidden">
          <div className="h-full bg-litera-accent rounded-full transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
        </div>
      )}
    </div>
  );
}

function PickedFiles({ paths }: { paths: string[] }) {
  return (
    <div className="mt-4 text-left text-xs text-litera-mute font-mono max-h-40 overflow-auto border border-litera-line rounded p-2">
      {paths.map((p) => <div key={p} className="truncate">{p}</div>)}
    </div>
  );
}

function ImportResultView({ result }: { result: ImportResult }) {
  const t = useT();
  return (
    <div className="litera-panel p-4 text-sm space-y-2">
      <div className="text-litera-text">
        {result.failed.length === 0
          ? t("import.pdfTab.done", { ok: String(result.ok) })
          : t("import.pdfTab.doneWithFail", { ok: String(result.ok), fail: String(result.failed.length) })}
      </div>
      {result.failed.map((f, i) => (
        <div key={i} className="text-xs text-red-400/90 font-mono">
          ✕ <span className="text-litera-mute">{f.path}</span> — {f.error}
        </div>
      ))}
    </div>
  );
}
