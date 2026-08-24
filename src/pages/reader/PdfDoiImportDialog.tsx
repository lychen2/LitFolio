import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileText, Loader2, Paperclip, X } from "lucide-react";
import { api, pickSinglePdf } from "@/lib/api";
import { usePdfDropTarget } from "@/hooks/usePdfDropTarget";
import { useT } from "@/i18n/I18nProvider";
import { importDoiWithAutoPdfAndLink } from "./doiImportActions";

interface Props {
  doi: string | null;
  sourcePaperId: string;
  onClose: () => void;
}

export function PdfDoiImportDialog({ doi, sourcePaperId, onClose }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const dropRef = useRef<HTMLDivElement>(null);
  const [pdfPath, setPdfPath] = useState<string | null>(null);
  const existingQ = useQuery({
    queryKey: ["paper-by-doi", doi],
    queryFn: () => api.paperFindByDoi(doi ?? ""),
    enabled: !!doi,
  });
  const draftQ = useQuery({
    queryKey: ["doi-draft", doi],
    queryFn: () => api.prepareDoiDraft(doi ?? ""),
    enabled: !!doi && existingQ.data === null,
  });
  const existingPaper = existingQ.data ?? null;
  const pointsToCurrentPaper = existingPaper?.id === sourcePaperId;
  const doiLookupPending =
    existingQ.isLoading ||
    existingQ.isFetching ||
    draftQ.isLoading ||
    draftQ.isFetching;

  const linkImportedPaper = useCallback(
    async (paperId: string) => {
      await api.paperLinkCreateOrGet(
        sourcePaperId,
        paperId,
        "builds_on",
        doi ? `DOI link clicked in PDF: ${doi}` : null,
      );
    },
    [doi, sourcePaperId],
  );


  const autoDownload = useMutation({
    mutationFn: async () => {
      if (pointsToCurrentPaper) throw new Error(t("reader.doiSelfLink"));
      const normalizedDoi = doi ?? "";
      const existing = await api.paperFindByDoi(normalizedDoi);
      if (existing) {
        if (existing.id === sourcePaperId) throw new Error(t("reader.doiSelfLink"));
        await linkImportedPaper(existing.id);
        return existing;
      }
      return importDoiWithAutoPdfAndLink(api, sourcePaperId, normalizedDoi);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["papers"] });
      qc.invalidateQueries({ queryKey: ["paper-links", sourcePaperId] });
      onClose();
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (pointsToCurrentPaper) throw new Error(t("reader.doiSelfLink"));
      if (existingPaper) {
        await linkImportedPaper(existingPaper.id);
        return existingPaper;
      }
      if (!draftQ.data || !pdfPath) throw new Error(t("reader.doiPdfRequired"));
      const paper = await api.paperSaveWithPdf(draftQ.data, pdfPath);
      await linkImportedPaper(paper.id);
      return paper;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["papers"] });
      qc.invalidateQueries({ queryKey: ["paper-links", sourcePaperId] });
      onClose();
    },
  });
  const resetAutoDownload = autoDownload.reset;
  const resetSave = save.reset;
  useEffect(() => {
    setPdfPath(null);
    resetAutoDownload();
    resetSave();
  }, [doi, resetAutoDownload, resetSave]);
  const handlePdfDrop = useCallback((paths: string[]) => {
    if (paths[0]) setPdfPath(paths[0]);
  }, []);
  usePdfDropTarget(dropRef, handlePdfDrop, !!doi && !save.isPending && !autoDownload.isPending);

  if (!doi) return null;

  return (
    <div className="absolute right-2 top-12 z-30 w-[24rem] rounded-md border border-litera-line bg-litera-paper shadow-2xl">
      <div className="flex items-center justify-between border-b border-litera-line px-3 py-2">
        <div className="min-w-0">
          <div className="text-xs text-litera-text">{t("reader.doiImportTitle")}</div>
          <div className="truncate font-mono text-[11px] text-litera-mute">{doi}</div>
        </div>
        <button onClick={onClose} className="text-litera-mute hover:text-litera-text">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div ref={dropRef} className="space-y-3 px-3 py-3">
        {existingQ.isLoading || draftQ.isLoading ? (
          <div className="inline-flex items-center gap-2 text-xs text-litera-mute">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t("reader.doiLoading")}
          </div>
        ) : existingQ.error || draftQ.error ? (
          <div className="break-all text-xs text-litera-error">
            {t("reader.doiLoadFailed", { message: ((existingQ.error ?? draftQ.error) as Error).message })}
          </div>
        ) : existingPaper ? (
          <div className="space-y-2">
            <div className="text-[11px] uppercase tracking-wider text-litera-mute">
              {pointsToCurrentPaper ? t("reader.doiCurrentPaper") : t("reader.doiExisting")}
            </div>
            <div className="text-sm font-medium leading-snug text-litera-text">{existingPaper.title}</div>
            <div className="text-xs leading-relaxed text-litera-mute">
              {existingPaper.authors.slice(0, 4).join(", ")}
              {existingPaper.year ? ` · ${existingPaper.year}` : ""}
              {existingPaper.venue ? ` · ${existingPaper.venue}` : ""}
            </div>
          </div>
        ) : draftQ.data ? (
          <div className="space-y-2">
            <div className="text-sm font-medium leading-snug text-litera-text">{draftQ.data.title}</div>
            <div className="text-xs leading-relaxed text-litera-mute">
              {draftQ.data.authors.slice(0, 4).join(", ")}
              {draftQ.data.year ? ` · ${draftQ.data.year}` : ""}
              {draftQ.data.venue ? ` · ${draftQ.data.venue}` : ""}
            </div>
            {draftQ.data.abstract_text && (
              <p className="line-clamp-4 text-xs leading-relaxed text-litera-text/75">
                {draftQ.data.abstract_text}
              </p>
            )}
          </div>
        ) : null}
        {!existingPaper && (
        <div className="rounded-md border border-dashed border-litera-line px-3 py-2">
          <div className="mb-2 text-[11px] uppercase tracking-wider text-litera-mute">
            {t("reader.doiPdfLabel")}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => autoDownload.mutate()}
              disabled={doiLookupPending || autoDownload.isPending || save.isPending || pointsToCurrentPaper}
              className="litera-btn-primary text-xs disabled:opacity-50"
            >
              {autoDownload.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {t("reader.doiAutoDownload")}
            </button>
            <button
              onClick={async () => setPdfPath(await pickSinglePdf())}
              disabled={doiLookupPending || autoDownload.isPending || save.isPending}
              className="litera-btn text-xs disabled:opacity-50"
            >
              <Paperclip className="h-3.5 w-3.5" />
              {t("reader.doiPickPdf")}
            </button>
            <div className="min-w-0 flex-1 truncate text-[11px] text-litera-mute">
              {pdfPath ? (
                <span className="inline-flex min-w-0 items-center gap-1">
                  <FileText className="h-3 w-3 shrink-0" />
                  <span className="truncate">{pdfPath}</span>
                </span>
              ) : (
                t("reader.doiDropPdf")
              )}
            </div>
          </div>
        </div>
        )}
        {autoDownload.error && (
          <div className="break-all text-xs text-litera-error">
            {t("reader.doiAutoDownloadFailed", { message: (autoDownload.error as Error).message })}
          </div>
        )}
        {save.error && (
          <div className="break-all text-xs text-litera-error">
            {t("reader.doiImportFailed", { message: (save.error as Error).message })}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="litera-btn text-xs">
            {t("common.cancel")}
          </button>
          <button
            onClick={() => save.mutate()}
            disabled={
              pointsToCurrentPaper ||
              (!existingPaper && (doiLookupPending || !draftQ.data || !pdfPath)) ||
              save.isPending ||
              autoDownload.isPending
            }
            className="litera-btn-primary text-xs disabled:opacity-50"
          >
            {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {existingPaper ? t("reader.doiLinkExisting") : t("reader.doiImportWithPdf")}
          </button>
        </div>
      </div>
    </div>
  );
}
