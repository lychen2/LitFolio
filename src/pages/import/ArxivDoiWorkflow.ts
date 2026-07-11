import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type ArxivDraft, type Paper } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";
import {
  duplicateStatusFromError,
  importJobId,
  pdfStatusFromPaper,
  subtitleFromDraft,
  titleFromDraft,
  upsertImportJob,
  type ImportJobSource,
  type ImportJobStatus,
  type ImportJobStepStatus,
} from "./importJobs";
import { notifyRecentImportsChanged } from "./recentImports";
import { type ImportSource } from "./types";

export type SourceKind = "arxiv" | "doi" | null;
export type AutoDownloadSource = "arxiv" | "scihub" | "crossref";
export type AutoDownloadSourceStatus = "failed" | "not_found";

export interface AutoDownloadSourceDecision {
  source: AutoDownloadSource;
  status: AutoDownloadSourceStatus;
  evidenceUrl: string | null;
  reason: string;
}

export interface AutoDownloadFailure {
  code: string | null;
  detail: string;
  sources: Partial<Record<AutoDownloadSource, string>>;
  decisions: AutoDownloadSourceDecision[];
}

const DOI_NO_PUBLIC_PDF = "DOI_AUTO_DOWNLOAD_NO_PUBLIC_PDF";
const DOI_PUBLIC_PDF_FAILED = "DOI_AUTO_DOWNLOAD_PUBLIC_PDF_FAILED";
const DOI_ALL_METHODS_FAILED = "DOI_AUTO_DOWNLOAD_ALL_FAILED";

export function detectSourceKind(value: string): SourceKind {
  const lower = value.toLowerCase();
  const isArxiv = /^\d{4}\.\d{4,5}/.test(value) || lower.includes("arxiv");
  if (isArxiv) return "arxiv";
  return /^10\./i.test(value) ||
    lower.includes("doi.org") ||
    lower.startsWith("doi:")
    ? "doi"
    : null;
}

type DraftSetters = {
  setValue: (value: string) => void;
  setDraft: (draft: ArxivDraft) => void;
  setSourceKind: (kind: SourceKind) => void;
  setError: (error: string | null) => void;
  setSuccess: (success: string | null) => void;
};

export function useFetchMetaMutation({
  value,
  source,
  ...setters
}: DraftSetters & { value: string; source?: ImportSource }) {
  const t = useT();
  return useMutation({
    onMutate: (v) => {
      const kind = detectSourceKind(v);
      if (!kind) return;
      upsertArxivDoiJob(
        { source, sourceKind: kind, value: v },
        {
          status: "running",
          metadataStatus: "checking",
          pdfStatus: "pending",
          duplicateStatus: "checking",
        }
      );
    },
    mutationFn: async (
      v: string
    ): Promise<{ draft: ArxivDraft; kind: Exclude<SourceKind, null> }> => {
      const kind = detectSourceKind(v);
      if (kind === "arxiv")
        return {
          draft: await api.prepareArxivDraft(v.replace(/^arxiv:/i, "").trim()),
          kind,
        };
      if (kind === "doi") return { draft: await api.prepareDoiDraft(v), kind };
      throw new Error(t("import.error.invalidId"));
    },
    onSuccess: ({ draft, kind }) => {
      applyDraft({ draft, kind, value, ...setters });
      upsertArxivDoiJob(
        { draft, source, sourceKind: kind, value },
        {
          status: "waiting",
          metadataStatus: "ready",
          pdfStatus: "pending",
          duplicateStatus: "checking",
        }
      );
    },
    onError: (e: Error, v) => {
      const kind = detectSourceKind(v);
      const error = formatMetadataFetchError(e.message, kind, t);
      setters.setError(error);
      upsertArxivDoiJob(
        { source, sourceKind: kind, value: v },
        {
          status: "failed",
          metadataStatus: "failed",
          pdfStatus: "skipped",
          duplicateStatus: duplicateStatusFromError(error),
          error,
        }
      );
    },
  });
}

function applyDraft({
  draft,
  kind,
  value,
  setValue,
  setDraft,
  setSourceKind,
  setError,
  setSuccess,
}: DraftSetters & {
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
  source,
  fetchMeta,
  setValue,
  setDraft,
  setSourceKind,
  setError,
  setSuccess,
}: DraftSetters & {
  source: ImportSource;
  fetchMeta: ReturnType<typeof useFetchMetaMutation>;
}) {
  return useMutation({
    onMutate: (itemId) => {
      upsertArxivDoiJob(
        { source, value: itemId },
        {
          sourceOverride: "rss",
          status: "running",
          metadataStatus: "checking",
          pdfStatus: "pending",
          duplicateStatus: "checking",
        }
      );
    },
    mutationFn: (itemId: string) => api.feedItemPrepareDraft(itemId),
    onSuccess: (draft) => {
      const fallbackKind = source.prefill
        ? detectSourceKind(source.prefill)
        : null;
      applyDraft({
        draft,
        kind: draft.arxiv_id || draft.doi ? undefined : fallbackKind,
        value: source.prefill ?? "",
        setValue,
        setDraft,
        setSourceKind,
        setError,
        setSuccess,
      });
      upsertArxivDoiJob(
        {
          draft,
          source,
          value: source.fromFeedItem ?? source.prefill ?? "rss",
        },
        {
          sourceOverride: "rss",
          status: "waiting",
          metadataStatus: "ready",
          pdfStatus: "pending",
          duplicateStatus: "checking",
        }
      );
    },
    onError: (error: Error, itemId) => {
      upsertArxivDoiJob(
        { source, value: itemId },
        {
          sourceOverride: "rss",
          status: "failed",
          metadataStatus: "failed",
          pdfStatus: "skipped",
          duplicateStatus: duplicateStatusFromError(error.message),
          error: error.message,
        }
      );
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
  setValue: (value: string) => void
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
  }, [
    source.fromFeedItem,
    source.prefill,
    prepareFeedDraft,
    fetchMeta,
    setValue,
  ]);
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
  source?: ImportSource;
  sourceKind?: SourceKind;
  selectedPdf?: string | null;
  trimmed?: string;
  linkBackToFeed: (paperId: string) => Promise<void>;
  markCandidateImported: () => Promise<void>;
  reset: () => void;
  setError: (error: string | null) => void;
  setSuccess: (success: string | null) => void;
  setAutoDownloadFailure?: (failure: AutoDownloadFailure | null) => void;
};

export function useSaveWithPdfMutation(params: SaveMutationParams) {
  const t = useT();
  const qc = useQueryClient();
  return useMutation({
    onMutate: () => {
      params.setError(null);
      params.setSuccess(null);
      upsertArxivDoiJob(params, {
        status: "running",
        metadataStatus: "completed",
        pdfStatus: "running",
        duplicateStatus: "checking",
      });
    },
    mutationFn: () => {
      if (!params.draft || !params.selectedPdf)
        throw new Error(t("import.error.missingMeta"));
      return api.paperSaveWithPdf(params.draft, params.selectedPdf);
    },
    onSuccess: async (p) => {
      params.setSuccess(t("import.saved", { title: p.title }));
      await params.linkBackToFeed(p.id);
      await params.markCandidateImported();
      markImportJobCompleted(params, p);
      params.reset();
      qc.invalidateQueries({ queryKey: ["papers"] });
      notifyRecentImportsChanged();
    },
    onError: (e: Error) => {
      params.setError(e.message);
      markImportJobFailed(params, e.message, "failed");
    },
  });
}

export function useAutoDownloadMutation(params: SaveMutationParams) {
  const t = useT();
  const qc = useQueryClient();
  return useMutation({
    onMutate: () => {
      params.setError(null);
      params.setSuccess(null);
      params.setAutoDownloadFailure?.(null);
      upsertArxivDoiJob(params, {
        status: "running",
        metadataStatus: "completed",
        pdfStatus: "running",
        duplicateStatus: "checking",
      });
    },
    mutationFn: () => {
      if (params.sourceKind === "doi") {
        return api.doiAddWithPdf(params.draft?.doi ?? params.trimmed ?? "");
      }
      return api.arxivAddWithPdf(
        params.draft?.arxiv_id ??
          params.trimmed?.replace(/^arxiv:/i, "").trim() ??
          ""
      );
    },
    onSuccess: async (p) => {
      params.setAutoDownloadFailure?.(null);
      params.setSuccess(t("import.downloadedSaved", { title: p.title }));
      await params.linkBackToFeed(p.id);
      await params.markCandidateImported();
      markImportJobCompleted(params, p);
      params.reset();
      qc.invalidateQueries({ queryKey: ["papers"] });
      notifyRecentImportsChanged();
    },
    onError: (e: Error) => {
      const failure = parseAutoDownloadFailure(e.message, params.sourceKind);
      const formatted = formatAutoDownloadError(
        e.message,
        params.sourceKind,
        t
      );
      params.setAutoDownloadFailure?.(failure);
      params.setError(formatted);
      markImportJobFailed(
        params,
        formatted,
        failure?.decisions.some((decision) => decision.status === "not_found")
          ? "missing"
          : "failed"
      );
    },
  });
}

type ImportJobContext = {
  draft?: ArxivDraft | null;
  source?: ImportSource;
  sourceKind?: SourceKind;
  trimmed?: string;
  value?: string;
};

type ImportJobUpdate = {
  sourceOverride?: ImportJobSource;
  status: ImportJobStatus;
  metadataStatus: ImportJobStepStatus;
  pdfStatus: ImportJobStepStatus;
  duplicateStatus: ImportJobStepStatus;
  error?: string;
  paper?: Paper;
};

function markImportJobCompleted(context: ImportJobContext, paper: Paper) {
  upsertArxivDoiJob(context, {
    status: "completed",
    metadataStatus: "completed",
    pdfStatus: pdfStatusFromPaper(paper),
    duplicateStatus: "clear",
    paper,
  });
}

function markImportJobFailed(
  context: ImportJobContext,
  error: string,
  pdfStatus: ImportJobStepStatus
) {
  upsertArxivDoiJob(context, {
    status: "failed",
    metadataStatus: context.draft ? "completed" : "failed",
    pdfStatus,
    duplicateStatus: duplicateStatusFromError(error),
    error,
  });
}

function upsertArxivDoiJob(context: ImportJobContext, update: ImportJobUpdate) {
  const source = update.sourceOverride ?? importJobSourceFromContext(context);
  const identity = importJobIdentity(context);
  const paper = update.paper;
  upsertImportJob({
    id: importJobId(source, identity),
    source,
    title:
      paper?.title ??
      titleFromDraft(context.draft, context.source?.title ?? identity),
    subtitle:
      subtitleFromDraft(context.draft) ?? context.source?.link ?? undefined,
    status: update.status,
    metadataStatus: update.metadataStatus,
    pdfStatus: update.pdfStatus,
    duplicateStatus: update.duplicateStatus,
    evidence: context.source?.link ?? undefined,
    error: update.error,
    paperId: paper?.id,
    candidateId: context.source?.candidateId ?? undefined,
    feedItemId: context.source?.fromFeedItem ?? undefined,
  });
}

function importJobSourceFromContext(
  context: ImportJobContext
): ImportJobSource {
  if (context.source?.fromFeedItem) return "rss";
  if (context.source?.candidateId != null) return "candidate";
  if (context.sourceKind) return context.sourceKind;
  const detected = detectSourceKind(importJobIdentity(context));
  return detected ?? "search";
}

function importJobIdentity(context: ImportJobContext): string {
  return (
    context.source?.fromFeedItem ??
    context.source?.candidateId?.toString() ??
    context.draft?.arxiv_id ??
    context.draft?.doi ??
    context.trimmed ??
    context.value ??
    context.source?.link ??
    context.source?.title ??
    "unknown"
  );
}

export function formatMetadataFetchError(
  message: string,
  sourceKind: SourceKind | undefined,
  t: ReturnType<typeof useT>
): string {
  if (sourceKind !== "doi") return message;
  if (/not a DOI/i.test(message)) {
    return t("import.error.doiInvalid");
  }
  if (/CrossRef returned 404/i.test(message)) {
    return t("import.error.doiNotFound");
  }
  if (/CrossRef returned (429|5\d\d)/i.test(message)) {
    return t("import.error.doiCrossrefUnavailable", { detail: message });
  }
  if (/CrossRef returned/i.test(message)) {
    return t("import.error.doiCrossrefRejected", { detail: message });
  }
  if (/decode CrossRef JSON/i.test(message)) {
    return t("import.error.doiCrossrefMalformed");
  }
  if (/GET https:\/\/api\.crossref\.org|request|network|timed out/i.test(message)) {
    return t("import.error.doiNetwork", { detail: message });
  }
  return message;
}

export function formatAutoDownloadError(
  message: string,
  sourceKind: SourceKind | undefined,
  t: ReturnType<typeof useT>
): string {
  if (sourceKind !== "doi") return message;
  const match = /^([A-Z0-9_]+):\s*(.*)$/.exec(message);
  if (!match) return message;

  const [, code, detail] = match;
  switch (code) {
    case DOI_NO_PUBLIC_PDF:
      return t("import.error.doiNoPublicPdf");
    case DOI_PUBLIC_PDF_FAILED:
      return t("import.error.doiPublicPdfFailed", { detail });
    case DOI_ALL_METHODS_FAILED:
      return t("import.error.doiAllMethodsFailed", { detail });
    default:
      return message;
  }
}

export function parseAutoDownloadFailure(
  message: string,
  sourceKind: SourceKind | undefined
): AutoDownloadFailure | null {
  const trimmed = message.trim();
  if (!trimmed) return null;
  if (sourceKind !== "doi") return parseArxivAutoDownloadFailure(trimmed);

  const match = /^([A-Z0-9_]+):\s*(.*)$/.exec(trimmed);
  const detail = match?.[2]?.trim() || trimmed;
  const sources = extractDoiAutoDownloadSourceDetails(detail);
  const decisions = (["scihub", "crossref"] as const).map((source) =>
    autoDownloadDecision(source, sources[source] ?? detail)
  );

  return { code: match?.[1] ?? null, detail, sources, decisions };
}

function parseArxivAutoDownloadFailure(message: string): AutoDownloadFailure {
  return {
    code: null,
    detail: message,
    sources: { arxiv: message },
    decisions: [autoDownloadDecision("arxiv", message)],
  };
}

function extractDoiAutoDownloadSourceDetails(
  detail: string
): Partial<Record<AutoDownloadSource, string>> {
  const sources: Partial<Record<AutoDownloadSource, string>> = {};
  const scihub = extractAutoDownloadSourceDetail(detail, "Sci-Hub");
  const crossref = extractAutoDownloadSourceDetail(detail, "CrossRef");
  if (scihub) sources.scihub = scihub;
  if (crossref) sources.crossref = crossref;
  return sources;
}

function autoDownloadDecision(
  source: AutoDownloadSource,
  detail: string
): AutoDownloadSourceDecision {
  const normalized = detail.trim();
  return {
    source,
    status: autoDownloadStatus(normalized),
    evidenceUrl: extractAutoDownloadEvidenceUrl(normalized),
    reason: normalizeAutoDownloadReason(source, normalized),
  };
}

function autoDownloadStatus(detail: string): AutoDownloadSourceStatus {
  const lower = detail.toLowerCase();
  if (
    lower.includes("no public pdf link") ||
    lower.includes("no pdf url resolved")
  ) {
    return "not_found";
  }
  return "failed";
}

function extractAutoDownloadEvidenceUrl(detail: string): string | null {
  const match = /https?:\/\/[^\s;)]+/.exec(detail);
  return match?.[0].replace(/[.,]+$/, "") ?? null;
}

function normalizeAutoDownloadReason(
  source: AutoDownloadSource,
  detail: string
): string {
  const sourceName = autoDownloadSourceName(source);
  const patterns = [
    new RegExp(
      `^${escapeRegExp(sourceName)} download(?:\\([^)]*\\))?:\\s*`,
      "i"
    ),
    new RegExp(`^${escapeRegExp(sourceName)} URL resolve:\\s*`, "i"),
    new RegExp(`^${escapeRegExp(sourceName)} PDF links:\\s*`, "i"),
    new RegExp(`^${escapeRegExp(sourceName)}(?:\\([^)]*\\))?:\\s*`, "i"),
  ];
  return (
    patterns
      .reduce((value, pattern) => value.replace(pattern, ""), detail)
      .trim() || detail
  );
}

function autoDownloadSourceName(source: AutoDownloadSource): string {
  switch (source) {
    case "arxiv":
      return "arXiv";
    case "scihub":
      return "Sci-Hub";
    case "crossref":
      return "CrossRef";
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractAutoDownloadSourceDetail(
  detail: string,
  sourceName: "Sci-Hub" | "CrossRef"
): string | null {
  const detailsIndex = detail.indexOf("Details:");
  const sourceDetails =
    detailsIndex >= 0 ? detail.slice(detailsIndex + "Details:".length) : detail;
  const sourcePrefix = sourceName.toLowerCase();
  return (
    sourceDetails
      .split(";")
      .map((chunk) => chunk.trim())
      .find((chunk) => chunk.toLowerCase().startsWith(sourcePrefix)) ?? null
  );
}
