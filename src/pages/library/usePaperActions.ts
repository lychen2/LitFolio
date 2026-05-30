import { useCallback, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, pickSinglePdf, type Paper } from "@/lib/api";
import { useI18n } from "@/i18n/I18nProvider";
import { llmLanguageNameFor } from "@/i18n/dict";
import { usePdfDropTarget } from "@/hooks/usePdfDropTarget";

/// Row-level mutations + PDF drop wiring for a single library paper.
/// Extracted from LibraryPage's PaperRow so the row component stays a thin
/// view: the hook owns react-query state, the drop target, and the
/// invalidation policy; the component just renders against it.
export function usePaperActions(p: Paper) {
  const qc = useQueryClient();
  const { lang } = useI18n();
  const rowRef = useRef<HTMLLIElement>(null);

  const invalidateList = () =>
    qc.invalidateQueries({ queryKey: ["papers"], refetchType: "active" });
  const invalidatePaper = () => qc.invalidateQueries({ queryKey: ["paper", p.id] });

  const tldr = useMutation({
    mutationFn: () => api.paperTldr(p.id),
    onSuccess: invalidateList,
  });
  const translate = useMutation({
    mutationFn: () => api.paperTranslate(p.id, llmLanguageNameFor(lang)),
    onSuccess: () => {
      invalidateList();
      invalidatePaper();
    },
  });
  const attachPdf = useMutation({
    mutationFn: async (sourcePath?: string) => {
      const src = sourcePath ?? (await pickSinglePdf());
      if (!src) return null;
      return api.paperAttachPdf(p.id, src);
    },
    onSuccess: (paper) => {
      if (paper) {
        invalidateList();
        invalidatePaper();
      }
    },
  });
  const del = useMutation({
    mutationFn: () => api.paperDelete(p.id),
    onSuccess: invalidateList,
  });
  const openMut = useMutation({ mutationFn: () => api.paperOpenPdf(p.id) });

  const handlePdfDrop = useCallback(
    (paths: string[]) => {
      const sourcePath = paths[0];
      if (!sourcePath) return Promise.resolve();
      return attachPdf.mutateAsync(sourcePath).then(() => undefined);
    },
    [attachPdf],
  );
  usePdfDropTarget(rowRef, handlePdfDrop, !attachPdf.isPending);

  const canOpenPdf = !!p.pdf_path;
  function openPdf() {
    if (!p.pdf_path) return;
    openMut.mutate();
  }

  return { rowRef, tldr, translate, attachPdf, del, openMut, canOpenPdf, openPdf };
}

export type PaperActionsState = ReturnType<typeof usePaperActions>;
