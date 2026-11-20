import { useId, useRef, useState } from "react";
import type { RefObject } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import { X, XCircle, FileText, Folder, Spinner, Upload } from "@/components/icons";
import { Button, IconButton } from "@/components/ui";
import { api, pickPdfFiles } from "@/lib/api";
import { errorMessage } from "@/lib/error";
import { useI18n, useT } from "@/i18n/I18nProvider";
import { usePdfDropTarget } from "@/hooks/usePdfDropTarget";
import { notifyLibraryChanged } from "@/lib/libraryRefresh";
import {
  duplicateStatusFromFailures,
  formatPdfImportError,
  importJobId,
  titleFromPath,
  upsertImportJob,
} from "./importJobs";
import { notifyRecentImportsChanged } from "./recentImports";
import "./PdfTab.css";

type PickedPdf = { path: string; name: string };

type ImportResult =
  | { ok: number; failed: { path: string; error: string }[] }
  | { error: string };
type FolderProgress = {
  phase: string;
  done: number;
  total: number;
  current: string;
  failed: number;
};
type FolderProgressPayload = Omit<FolderProgress, "current"> & {
  current_file: string;
};

export function PdfTab({ allowFolderImport }: { allowFolderImport: boolean }) {
  const t = useT();
  const qc = useQueryClient();
  const [picked, setPicked] = useState<PickedPdf[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [folderProgress, setFolderProgress] = useState<FolderProgress | null>(
    null
  );

  const m = useMutation({
    mutationFn: async (files: PickedPdf[]) => {
      const paths = files.map(({ path }) => path);
      setResult(null);
      upsertImportJob({
        id: importJobId("pdf", paths.join("|")),
        source: "pdf",
        title: t("import.pdfTab.importBtn", { count: String(paths.length) }),
        subtitle: files.map(({ name }) => name).join(" · "),
        status: "running",
        metadataStatus: "running",
        pdfStatus: "running",
        duplicateStatus: "checking",
        progress: { done: 0, total: paths.length },
      });
      return api.importPdfFiles(paths);
    },
    onSuccess: (s, files) => {
      const id = importJobId("pdf", files.map(({ path }) => path).join("|"));
      const failed = s.failed.map((item) => ({
        path: item.path,
        error: formatPdfImportError(item.error, t),
      }));
      setResult({ ok: s.imported.length, failed });
      setPicked([]);
      upsertImportJob({
        id,
        source: "pdf",
        title: t("import.pdfTab.importBtn", { count: String(files.length) }),
        subtitle: files.map(({ name }) => name).join(" · "),
        status: failed.length > 0 ? "failed" : "completed",
        metadataStatus: s.imported.length > 0 ? "completed" : "failed",
        pdfStatus: s.imported.length > 0 ? "completed" : "failed",
        duplicateStatus: duplicateStatusFromFailures(failed),
        error: failed[0]?.error,
        progress: {
          done: s.imported.length,
          total: files.length,
          failed: failed.length,
        },
      });
      void qc.invalidateQueries({ queryKey: ["papers"] });
      if (s.imported.length) notifyLibraryChanged();
      notifyRecentImportsChanged();
    },
    onError: (e, files) => {
      const error = formatPdfImportError(errorMessage(e), t);
      setResult({ error });
      upsertImportJob({
        id: importJobId("pdf", files.map(({ path }) => path).join("|")),
        source: "pdf",
        title: t("import.pdfTab.importBtn", { count: String(files.length) }),
        subtitle: files.map(({ name }) => name).join(" · "),
        status: "failed",
        metadataStatus: "failed",
        pdfStatus: "failed",
        duplicateStatus: duplicateStatusFromFailures([{ error }]),
        error,
        progress: { done: 0, total: files.length, failed: files.length },
      });
    },
  });
  const folderMut = useFolderImportMutation(setFolderProgress, setResult, t);
  const dropRef = useRef<HTMLDivElement>(null);
  const pickRef = useRef<HTMLButtonElement>(null);
  const busy = m.isPending || folderMut.isPending;
  usePdfDropTarget(dropRef, (paths) => {
    setPicked(paths.map((path) => ({ path, name: titleFromPath(path) })));
  }, !busy);

  async function pick() {
    try {
      const paths = await pickPdfFiles();
      if (!paths?.length) return;
      const names = paths.some((path) => path.startsWith("content://"))
        ? await api.pdfDocumentNames(paths)
        : [];
      setPicked(paths.map((path, index) => ({ path, name: names[index] ?? titleFromPath(path) })));
    } catch (e) {
      const error = formatPdfImportError(errorMessage(e), t);
      setResult({ error });
    }
  }

  async function pickFolder() {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (typeof selected === "string" && selected) folderMut.mutate(selected);
    } catch (e) {
      const error = formatPdfImportError(errorMessage(e), t);
      setResult({ error });
    }
  }

  return (
    <div className="pdf-import max-w-3xl space-y-4">
      <div ref={dropRef} className="litera-panel space-y-3 p-4">
        <PdfPickActions
          pickRef={pickRef}
          pickedCount={picked.length}
          filePending={m.isPending}
          folderPending={folderMut.isPending}
          onPick={pick}
          onPickFolder={allowFolderImport ? pickFolder : undefined}
          onImport={() => m.mutate(picked)}
        />
        {folderProgress && <FolderProgressView progress={folderProgress} />}
        {picked.length > 0 && (
          <PickedFiles
            files={picked}
            disabled={busy}
            onRemove={(path) => setPicked((files) => files.filter((file) => file.path !== path))}
            onEmpty={() => pickRef.current?.focus()}
          />
        )}
        <details className="text-xs text-litera-mute">
          <summary className="w-fit cursor-pointer hover:text-litera-text">{t("import.pdfTab.dragHint")}</summary>
          <p className="mt-2 leading-relaxed">{t("import.pdfTab.hint", { path: "papers/<id>/original.pdf" })}</p>
        </details>
      </div>
      <ImportResultView result={result} />
    </div>
  );
}

function useFolderImportMutation(
  setFolderProgress: (progress: FolderProgress | null) => void,
  setResult: (result: ImportResult | null) => void,
  t: ReturnType<typeof useT>
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dirPath: string) => {
      setResult(null);
      upsertImportJob({
        id: importJobId("folder", dirPath),
        source: "folder",
        title: titleFromPath(dirPath),
        subtitle: dirPath,
        status: "running",
        metadataStatus: "running",
        pdfStatus: "running",
        duplicateStatus: "checking",
      });
      const { listen } = await import("@tauri-apps/api/event");
      const unlisten = await listen<FolderProgressPayload>(
        "folder-import-progress",
        (e) => {
          const p = e.payload;
          setFolderProgress({
            phase: p.phase,
            done: p.done,
            total: p.total,
            current: p.current_file,
            failed: p.failed,
          });
          upsertImportJob({
            id: importJobId("folder", dirPath),
            source: "folder",
            title: titleFromPath(dirPath),
            subtitle: p.current_file || dirPath,
            status: p.phase === "done" ? "completed" : "running",
            metadataStatus: p.phase === "done" ? "completed" : "running",
            pdfStatus: p.phase === "done" ? "completed" : "running",
            duplicateStatus: p.failed > 0 ? "unknown" : "checking",
            progress: {
              done: p.done,
              total: p.total,
              failed: p.failed,
              label: p.phase,
            },
          });
        }
      );
      try {
        return await api.importFolder(dirPath);
      } finally {
        unlisten();
      }
    },
    onSuccess: (s, dirPath) => {
      const failed = s.failed.map((item) => ({
        path: item.path,
        error: formatPdfImportError(item.error, t),
      }));
      setResult({ ok: s.imported.length, failed });
      setFolderProgress(null);
      upsertImportJob({
        id: importJobId("folder", dirPath),
        source: "folder",
        title: titleFromPath(dirPath),
        subtitle: dirPath,
        status: failed.length > 0 ? "failed" : "completed",
        metadataStatus: s.imported.length > 0 ? "completed" : "failed",
        pdfStatus: s.imported.length > 0 ? "completed" : "failed",
        duplicateStatus: duplicateStatusFromFailures(failed),
        error: failed[0]?.error,
        progress: {
          done: s.imported.length,
          total: s.imported.length + failed.length,
          failed: failed.length,
        },
      });
      void qc.invalidateQueries({ queryKey: ["papers"] });
      if (s.imported.length) notifyLibraryChanged();
      notifyRecentImportsChanged();
    },
    onError: (e: Error, dirPath) => {
      const error = formatPdfImportError(e.message, t);
      setResult({ error });
      setFolderProgress(null);
      upsertImportJob({
        id: importJobId("folder", dirPath),
        source: "folder",
        title: titleFromPath(dirPath),
        subtitle: dirPath,
        status: "failed",
        metadataStatus: "failed",
        pdfStatus: "failed",
        duplicateStatus: duplicateStatusFromFailures([{ error }]),
        error,
      });
    },
  });
}

function PdfPickActions({
  pickRef,
  pickedCount,
  filePending,
  folderPending,
  onPick,
  onPickFolder,
  onImport,
}: {
  pickRef: RefObject<HTMLButtonElement>;
  pickedCount: number;
  filePending: boolean;
  folderPending: boolean;
  onPick: () => void;
  onPickFolder?: () => void;
  onImport: () => void;
}) {
  const { lang, t } = useI18n();
  const labelId = useId();
  const hintId = useId();
  const busy = filePending || folderPending;
  const dropHint = lang === "zh"
    ? (pickedCount ? "拖入 PDF 可替换当前选择" : "拖入 PDF，确认清单后再导入")
    : (pickedCount ? "Drop PDFs here to replace the current selection" : "Drop PDFs here to review them before importing");
  return (
    <>
      <Button
        ref={pickRef}
        className="pdf-import__picker"
        onClick={onPick}
        disabled={busy}
        aria-labelledby={labelId}
        aria-describedby={busy ? undefined : hintId}
      >
        <Upload className="pdf-import__picker-icon h-5 w-5 shrink-0" />
        <span className="min-w-0">
          <span id={labelId} className="block">{t("import.pdfTab.pick")}</span>
          <span id={hintId} className="block text-xs font-normal text-litera-mute">
            {busy ? t("drop.importing") : dropHint}
          </span>
        </span>
      </Button>
      {(onPickFolder || pickedCount > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {onPickFolder && (
            <Button onClick={onPickFolder} disabled={busy}>
              <Folder className="h-4 w-4" /> {t("import.pdfTab.pickFolder")}
            </Button>
          )}
          {pickedCount > 0 && (
            <Button variant="primary" onClick={onImport} disabled={busy}>
              {filePending ? (
                <Spinner className="h-4 w-4 motion-safe:animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              {t("import.pdfTab.importBtn", { count: String(pickedCount) })}
            </Button>
          )}
        </div>
      )}
      <div role="status" className="sr-only">
        {busy && t("drop.importing")}
      </div>
    </>
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
        : t("import.pdfTab.folderProgress", {
            done: String(progress.done),
            total: String(progress.total),
          })}
      {progress.current && (
        <span className="block break-all font-mono">{progress.current}</span>
      )}
      {progress.total > 0 && progress.phase !== "done" && (
        <div className="mt-1 h-1.5 bg-litera-line rounded-full overflow-hidden">
          <div
            className="h-full bg-litera-accent rounded-full motion-safe:transition-[width]"
            style={{ width: `${(progress.done / progress.total) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}

function PickedFiles({ files, disabled, onRemove, onEmpty }: {
  files: PickedPdf[];
  disabled: boolean;
  onRemove: (path: string) => void;
  onEmpty: () => void;
}) {
  const { lang } = useI18n();
  return (
    <ul className="pdf-import__queue" aria-label={lang === "zh" ? "待导入的 PDF" : "PDFs to import"}>
      {files.map(({ path, name }) => {
        return (
          <li key={path} className="pdf-import__file">
            <FileText className="mt-1 h-4 w-4 shrink-0 text-litera-mute" />
            <details className="min-w-0">
              <summary className="pdf-import__file-name">{name}</summary>
              <p className="mt-1 select-text break-all font-mono text-xs text-litera-mute">{path}</p>
            </details>
            <IconButton
              className="pdf-import__remove"
              label={lang === "zh" ? `从清单移除 ${name}` : `Remove ${name} from the list`}
              disabled={disabled}
              onClick={(event) => {
                const row = event.currentTarget.closest("li");
                const next = row?.nextElementSibling ?? row?.previousElementSibling;
                const nextButton = next?.querySelector("button");
                if (nextButton) nextButton.focus();
                else onEmpty();
                onRemove(path);
              }}
            >
              <X className="h-4 w-4" />
            </IconButton>
          </li>
        );
      })}
    </ul>
  );
}

function ImportResultView({ result }: { result: ImportResult | null }) {
  const { lang, t } = useI18n();
  const counts = result && "ok" in result ? result : undefined;
  const failedCount = counts?.failed.length ?? 0;
  const error = result && "error" in result ? result.error : undefined;
  let summary = "";
  if (error !== undefined) {
    summary = lang === "zh" ? "导入未完成" : "Import could not be completed";
  } else if (counts) {
    if (counts.ok === 0) {
      if (failedCount) {
        summary = lang === "zh" ? `${failedCount} 个文件导入失败` : `Failed files: ${failedCount}`;
      } else {
        summary = lang === "zh" ? "没有导入 PDF" : "No PDFs imported";
      }
    } else if (failedCount) {
      summary = t("import.pdfTab.doneWithFail", { ok: String(counts.ok), fail: String(failedCount) });
    } else {
      summary = t("import.pdfTab.done", { ok: String(counts.ok) });
    }
  }

  return (
    <div className={result ? "litera-panel space-y-2 p-4 text-sm" : "sr-only"}>
      <p className="pdf-import__receipt-label" role="status">{summary}</p>
      {counts && counts.ok + failedCount > 0 && (
        <div className="pdf-import__receipt-bar" aria-hidden="true">
          {counts.ok > 0 && <span className="pdf-import__receipt-ok" style={{ flexGrow: counts.ok }} />}
          {failedCount > 0 && <span className="pdf-import__receipt-failed" style={{ flexGrow: failedCount }} />}
        </div>
      )}
      {error !== undefined && <p className="pdf-import__failure">{error}</p>}
      {counts && failedCount > 0 && (
        <ul className="divide-y divide-litera-line">
          {counts.failed.map((failure) => (
            <li key={failure.path} className="flex items-start gap-2 py-2 text-xs">
              <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-litera-error" />
              <div className="min-w-0">
                <p className="break-all font-mono text-litera-mute">{failure.path}</p>
                <p className="pdf-import__failure">{failure.error}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
