import { type TKey } from "@/i18n/dict";

import { useEffect, useState } from "react";

export const IMPORT_JOBS_CHANGED_EVENT = "litera:import-jobs-changed";

const STORAGE_KEY = "litera.import.jobs";
const MAX_IMPORT_JOBS = 30;

export type ImportJobSource =
  | "pdf"
  | "folder"
  | "doi"
  | "arxiv"
  | "rss"
  | "candidate"
  | "search";

export type ImportJobStatus =
  | "queued"
  | "waiting"
  | "running"
  | "completed"
  | "failed";

export type ImportJobStepStatus =
  | "unknown"
  | "pending"
  | "checking"
  | "ready"
  | "missing"
  | "running"
  | "completed"
  | "failed"
  | "clear"
  | "duplicate"
  | "candidate"
  | "skipped";

export interface ImportJobProgress {
  done: number;
  total: number;
  failed?: number;
  label?: string;
}

export interface ImportJob {
  id: string;
  source: ImportJobSource;
  title: string;
  subtitle?: string;
  status: ImportJobStatus;
  metadataStatus: ImportJobStepStatus;
  pdfStatus: ImportJobStepStatus;
  duplicateStatus: ImportJobStepStatus;
  evidence?: string;
  error?: string;
  progress?: ImportJobProgress;
  paperId?: string;
  candidateId?: number;
  feedItemId?: string;
  createdAt: number;
  updatedAt: number;
}

export type ImportJobPatch = Pick<ImportJob, "id" | "source" | "title"> &
  Partial<Omit<ImportJob, "id" | "source" | "title">>;

export function useImportJobs() {
  const [jobs, setJobs] = useState<ImportJob[]>(() => readImportJobs());

  useEffect(() => {
    function refreshJobs() {
      setJobs(readImportJobs());
    }

    refreshJobs();
    window.addEventListener(IMPORT_JOBS_CHANGED_EVENT, refreshJobs);
    window.addEventListener("storage", refreshJobs);
    return () => {
      window.removeEventListener(IMPORT_JOBS_CHANGED_EVENT, refreshJobs);
      window.removeEventListener("storage", refreshJobs);
    };
  }, []);

  return jobs;
}

export function upsertImportJob(patch: ImportJobPatch) {
  if (!canUseStorage()) return;
  writeImportJobs(mergeImportJob(readImportJobs(), patch));
  dispatchImportJobsChanged();
}

export function clearResolvedImportJobs() {
  if (!canUseStorage()) return;
  writeImportJobs(
    readImportJobs().filter(
      (job) => job.status !== "completed" && job.status !== "failed"
    )
  );
  dispatchImportJobsChanged();
}

export function readImportJobs(): ImportJob[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isImportJob).slice(0, MAX_IMPORT_JOBS);
  } catch {
    return [];
  }
}

export function mergeImportJob(
  jobs: ImportJob[],
  patch: ImportJobPatch,
  now = Date.now()
): ImportJob[] {
  const existing = jobs.find((job) => job.id === patch.id);
  const next: ImportJob = {
    id: patch.id,
    source: patch.source,
    title: patch.title,
    subtitle: patch.subtitle ?? existing?.subtitle,
    status: patch.status ?? existing?.status ?? "queued",
    metadataStatus:
      patch.metadataStatus ?? existing?.metadataStatus ?? "unknown",
    pdfStatus: patch.pdfStatus ?? existing?.pdfStatus ?? "unknown",
    duplicateStatus:
      patch.duplicateStatus ?? existing?.duplicateStatus ?? "unknown",
    evidence: patch.evidence ?? existing?.evidence,
    error: patch.error,
    progress: patch.progress ?? existing?.progress,
    paperId: patch.paperId ?? existing?.paperId,
    candidateId: patch.candidateId ?? existing?.candidateId,
    feedItemId: patch.feedItemId ?? existing?.feedItemId,
    createdAt: existing?.createdAt ?? patch.createdAt ?? now,
    updatedAt: patch.updatedAt ?? now,
  };

  return [next, ...jobs.filter((job) => job.id !== patch.id)]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_IMPORT_JOBS);
}

export function importJobId(source: ImportJobSource, identity: string): string {
  const normalized = identity
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
  return `${source}:${normalized || "unknown"}`;
}

export function titleFromPath(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

export function duplicateStatusFromError(error: string): ImportJobStepStatus {
  return /duplicate|already exists|already imported|已有|已存在|重复/i.test(
    error
  )
    ? "duplicate"
    : "unknown";
}

export function duplicateStatusFromFailures(
  failed: { error: string }[]
): ImportJobStepStatus {
  if (failed.length === 0) return "clear";
  return failed.some(
    (item) => duplicateStatusFromError(item.error) === "duplicate"
  )
    ? "duplicate"
    : "unknown";
}

type Translate = (key: TKey, vars?: Record<string, string>) => string;

export function formatPdfImportError(error: string, t: Translate): string {
  const detail = { detail: error };
  if (/cannot be canonicalized|No such file|os error 2/i.test(error)) {
    return t("import.error.pdfMissing", detail);
  }
  if (/is not a regular file/i.test(error)) {
    return t("import.error.pdfNotFile", detail);
  }
  if (/only \.pdf files are accepted/i.test(error)) {
    return t("import.error.pdfWrongExtension", detail);
  }
  if (/already inside the library/i.test(error)) {
    return t("import.error.pdfInsideLibrary", detail);
  }
  if (/%PDF- header|not a valid PDF|read PDF header/i.test(error)) {
    return t("import.error.pdfInvalid", detail);
  }
  if (/copy PDF|create paper dir/i.test(error)) {
    return t("import.error.pdfCopyFailed", detail);
  }
  return error;
}

export type ImportJobDraftLike = {
  title?: string | null;
  authors?: string[] | null;
  year?: number | null;
  venue?: string | null;
  doi?: string | null;
  arxiv_id?: string | null;
};

export type ImportJobPaperLike = ImportJobDraftLike & {
  id?: string;
  pdf_path?: string | null;
};

export function titleFromDraft(
  draft: ImportJobDraftLike | null | undefined,
  fallback: string
): string {
  return draft?.title?.trim() || fallback;
}

export function subtitleFromDraft(
  draft: ImportJobDraftLike | null | undefined
): string | undefined {
  if (!draft) return undefined;
  const parts = [
    draft.arxiv_id ? `arXiv:${draft.arxiv_id}` : null,
    draft.doi ? `doi:${draft.doi}` : null,
    draft.venue,
    draft.year ? String(draft.year) : null,
  ].filter((part): part is string => !!part);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

export function pdfStatusFromPaper(
  paper: ImportJobPaperLike | null | undefined
): ImportJobStepStatus {
  return paper?.pdf_path ? "completed" : "missing";
}

function writeImportJobs(jobs: ImportJob[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
}

function dispatchImportJobsChanged() {
  window.dispatchEvent(new Event(IMPORT_JOBS_CHANGED_EVENT));
}

function canUseStorage() {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

function isImportJob(value: unknown): value is ImportJob {
  if (!value || typeof value !== "object") return false;
  const job = value as Partial<ImportJob>;
  return (
    typeof job.id === "string" &&
    typeof job.source === "string" &&
    typeof job.title === "string" &&
    typeof job.status === "string" &&
    typeof job.metadataStatus === "string" &&
    typeof job.pdfStatus === "string" &&
    typeof job.duplicateStatus === "string" &&
    typeof job.createdAt === "number" &&
    typeof job.updatedAt === "number"
  );
}
