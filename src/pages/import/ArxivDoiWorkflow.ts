import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type ArxivDraft } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";
import { type ImportSource } from "./types";

export type SourceKind = "arxiv" | "doi" | null;

export function detectSourceKind(value: string): SourceKind {
  const isArxiv = /^\d{4}\.\d{4,5}/.test(value) || value.toLowerCase().includes("arxiv");
  if (isArxiv) return "arxiv";
  return /^10\./.test(value) || value.includes("doi.org") ? "doi" : null;
}

type DraftSetters = {
  setValue: (value: string) => void;
  setDraft: (draft: ArxivDraft) => void;
  setSourceKind: (kind: SourceKind) => void;
  setError: (error: string | null) => void;
  setSuccess: (success: string | null) => void;
};

export function useFetchMetaMutation({ value, ...setters }: DraftSetters & { value: string }) {
  const t = useT();
  return useMutation({
    mutationFn: async (v: string): Promise<{ draft: ArxivDraft; kind: Exclude<SourceKind, null> }> => {
      const kind = detectSourceKind(v);
      if (kind === "arxiv") return { draft: await api.prepareArxivDraft(v.replace(/^arxiv:/i, "").trim()), kind };
      if (kind === "doi") return { draft: await api.prepareDoiDraft(v), kind };
      throw new Error(t("import.error.invalidId"));
    },
    onSuccess: ({ draft, kind }) => applyDraft({ draft, kind, value, ...setters }),
    onError: (e: Error) => setters.setError(e.message),
  });
}

function applyDraft({ draft, kind, value, setValue, setDraft, setSourceKind, setError, setSuccess }: DraftSetters & {
  draft: ArxivDraft;
  kind?: SourceKind;
  value: string;
}) {
  setDraft(draft);
  setSourceKind(kind ?? (draft.arxiv_id ? "arxiv" : draft.doi ? "doi" : null));
  setValue(draft.arxiv_id ?? draft.doi ?? value);
  setError(null);
  setSuccess(null);
}

export function usePrepareFeedDraftMutation({
  source, fetchMeta, setValue, setDraft, setSourceKind, setError, setSuccess,
}: DraftSetters & {
  source: ImportSource;
  fetchMeta: ReturnType<typeof useFetchMetaMutation>;
}) {
  return useMutation({
    mutationFn: (itemId: string) => api.feedItemPrepareDraft(itemId),
    onSuccess: (draft) => applyDraft({ draft, value: "", setValue, setDraft, setSourceKind, setError, setSuccess }),
    onError: () => {
      if (!source.prefill) return;
      setValue(source.prefill);
      fetchMeta.mutate(source.prefill);
    },
  });
}

export function usePrefillDraft(
  source: ImportSource,
  prepareFeedDraft: (itemId: string) => void,
  fetchMeta: (value: string) => void,
  setValue: (value: string) => void,
) {
  useEffect(() => {
    if (source.fromFeedItem) {
      prepareFeedDraft(source.fromFeedItem);
      return;
    }
    if (source.prefill) {
      setValue(source.prefill);
      fetchMeta(source.prefill);
    }
  }, [source.fromFeedItem, source.prefill, prepareFeedDraft, fetchMeta, setValue]);
}

export function useLinkBackToFeed(source: ImportSource) {
  const qc = useQueryClient();
  return async (paperId: string) => {
    if (!source.fromFeedItem) return;
    try {
      await api.feedItemLinkPaper(source.fromFeedItem, paperId);
      qc.invalidateQueries({ queryKey: ["feeds"] });
      qc.invalidateQueries({ queryKey: ["feed-items"] });
    } catch {
      // Best-effort linkback mirrors the existing import flow behavior.
    }
  };
}

export function useMarkCandidateImported(source: ImportSource) {
  const qc = useQueryClient();
  return async () => {
    if (source.candidateId == null) return;
    await api.candidateSetStatus(source.candidateId, "imported");
    qc.invalidateQueries({ queryKey: ["candidates"] });
  };
}

type SaveMutationParams = {
  draft: ArxivDraft | null;
  selectedPdf?: string | null;
  trimmed?: string;
  linkBackToFeed: (paperId: string) => Promise<void>;
  markCandidateImported: () => Promise<void>;
  reset: () => void;
  setError: (error: string | null) => void;
  setSuccess: (success: string | null) => void;
};

export function useSaveWithPdfMutation(params: SaveMutationParams) {
  const t = useT();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => {
      if (!params.draft || !params.selectedPdf) throw new Error(t("import.error.missingMeta"));
      return api.paperSaveWithPdf(params.draft, params.selectedPdf);
    },
    onSuccess: async (p) => {
      params.setSuccess(t("import.saved", { title: p.title }));
      await params.linkBackToFeed(p.id);
      await params.markCandidateImported();
      params.reset();
      qc.invalidateQueries({ queryKey: ["papers"] });
    },
    onError: (e: Error) => params.setError(e.message),
  });
}

export function useAutoDownloadMutation(params: SaveMutationParams) {
  const t = useT();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.arxivAddWithPdf(params.draft?.arxiv_id ?? params.trimmed?.replace(/^arxiv:/i, "").trim() ?? ""),
    onSuccess: async (p) => {
      params.setSuccess(t("import.downloadedSaved", { title: p.title }));
      await params.linkBackToFeed(p.id);
      await params.markCandidateImported();
      params.reset();
      qc.invalidateQueries({ queryKey: ["papers"] });
    },
    onError: (e: Error) => params.setError(e.message),
  });
}
