import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  FileText,
  Inbox,
  Loader2,
  Radio,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type JobRecord, type JobStatus } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";
import { type TKey } from "@/i18n/dict";
import {
  clearResolvedImportJobs,
  type ImportJob,
  type ImportJobProgress,
  type ImportJobSource,
  type ImportJobStatus,
  type ImportJobStepStatus,
  useImportJobs,
} from "./importJobs";

const VISIBLE_JOB_LIMIT = 8;

export function ImportJobInbox() {
  const t = useT();
  const localJobs = useImportJobs();
  const persistedJobs = useQuery({
    queryKey: ["jobs", "import-inbox"],
    queryFn: () => api.jobsList(null, 20),
    refetchInterval: 5000,
  });
  const items = mergeInboxItems(localJobs, persistedJobs.data ?? []);
  const visibleItems = items.slice(0, VISIBLE_JOB_LIMIT);
  const activeCount = items.filter(isActiveInboxItem).length;
  const localResolvedCount = localJobs.filter((job) => !isActiveJob(job)).length;

  return (
    <section className="litera-panel p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-litera-mute">
            <Inbox className="h-3.5 w-3.5 text-litera-accent" />
            {t("import.jobs.title")}
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-litera-mute">
            {t("import.jobs.subtitle")}
          </p>
        </div>
        {localResolvedCount > 0 && (
          <button
            type="button"
            onClick={clearResolvedImportJobs}
            className="rounded-md px-2 py-1 text-[11px] text-litera-mute hover:bg-litera-line/60 hover:text-litera-text"
          >
            {t("import.jobs.clearResolved")}
          </button>
        )}
      </div>

      {visibleItems.length === 0 ? (
        <div className="rounded-lg border border-dashed border-litera-line/80 p-3 text-xs leading-relaxed text-litera-mute">
          {persistedJobs.isLoading ? t("route.loading") : t("import.jobs.empty")}
        </div>
      ) : (
        <div className="space-y-3">
          <JobSummary activeCount={activeCount} totalCount={items.length} />
          {visibleItems.map((item) =>
            item.kind === "local" ? (
              <ImportJobCard key={`local:${item.job.id}`} job={item.job} />
            ) : (
              <PersistedJobCard key={`persisted:${item.job.id}`} job={item.job} />
            )
          )}
        </div>
      )}
    </section>
  );
}

function JobSummary({
  activeCount,
  totalCount,
}: {
  activeCount: number;
  totalCount: number;
}) {
  const t = useT();
  return (
    <div className="flex flex-wrap gap-2 text-[11px] text-litera-mute">
      <span className="rounded-full border border-litera-line/80 px-2 py-0.5">
        {t("import.jobs.summaryTotal", { count: totalCount })}
      </span>
      <span className="rounded-full border border-litera-line/80 px-2 py-0.5">
        {t("import.jobs.summaryActive", { count: activeCount })}
      </span>
    </div>
  );
}

function ImportJobCard({ job }: { job: ImportJob }) {
  const t = useT();
  return (
    <article className="rounded-lg border border-litera-line/70 bg-litera-ink/15 p-3">
      <div className="flex items-start gap-2">
        <JobStatusIcon status={job.status} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-litera-line/70 px-2 py-0.5 text-[10px] uppercase tracking-wider text-litera-mute">
              {t(sourceKey(job.source))}
            </span>
            <span
              className={
                "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider " +
                statusClassName(job.status)
              }
            >
              {t(statusKey(job.status))}
            </span>
          </div>
          <h3
            className="mt-1 truncate text-sm font-medium leading-snug text-litera-text"
            title={job.title}
          >
            {job.title}
          </h3>
          {job.subtitle && (
            <p
              className="mt-0.5 truncate text-[11px] text-litera-mute"
              title={job.subtitle}
            >
              {job.subtitle}
            </p>
          )}
        </div>
      </div>

      <JobProgress progress={job.progress} />

      <dl className="mt-3 grid gap-1.5 text-[11px] sm:grid-cols-3">
        <StepState
          label={t("import.jobs.metadata")}
          status={job.metadataStatus}
        />
        <StepState label={t("import.jobs.pdf")} status={job.pdfStatus} />
        <StepState
          label={t("import.jobs.duplicate")}
          status={job.duplicateStatus}
        />
      </dl>

      {(job.evidence || job.error) && (
        <div className="mt-2 space-y-1 text-[11px] leading-relaxed">
          {job.evidence && (
            <p className="break-words text-litera-mute">{job.evidence}</p>
          )}
          {job.error && (
            <p className="break-words text-red-400/90">✕ {job.error}</p>
          )}
        </div>
      )}
    </article>
  );
}

function PersistedJobCard({ job }: { job: JobRecord }) {
  const t = useT();
  const qc = useQueryClient();
  const cancel = useMutation({
    mutationFn: () => api.jobCancel(job.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs", "import-inbox"] }),
  });
  const retry = useMutation({
    mutationFn: () => api.jobRetry(job.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs", "import-inbox"] }),
  });
  const progress = persistedJobProgress(job);

  return (
    <article className="rounded-lg border border-litera-line/70 bg-litera-ink/15 p-3">
      <div className="flex items-start gap-2">
        <PersistedJobStatusIcon status={job.status} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-litera-line/70 px-2 py-0.5 text-[10px] uppercase tracking-wider text-litera-mute">
              {persistedJobKindLabel(job.kind)}
            </span>
            <span
              className={
                "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider " +
                persistedStatusClassName(job.status)
              }
            >
              {t(persistedStatusKey(job.status))}
            </span>
          </div>
          <h3
            className="mt-1 truncate text-sm font-medium leading-snug text-litera-text"
            title={job.title}
          >
            {job.title}
          </h3>
          {job.scope && (
            <p className="mt-0.5 truncate text-[11px] text-litera-mute" title={job.scope}>
              {job.scope}
            </p>
          )}
        </div>
      </div>

      <JobProgress progress={progress} />

      {(job.error || canMutatePersistedJob(job)) && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
          {job.error ? (
            <p className="min-w-0 flex-1 break-words text-red-400/90">✕ {job.error}</p>
          ) : (
            <span className="text-litera-mute" />
          )}
          <div className="flex items-center gap-1.5">
            {job.status === "running" && (
              <button
                type="button"
                onClick={() => cancel.mutate()}
                disabled={cancel.isPending}
                className="inline-flex items-center gap-1 rounded-md border border-litera-line/80 px-2 py-1 text-litera-mute hover:bg-litera-line/50 hover:text-litera-text disabled:opacity-60"
              >
                <XCircle className="h-3 w-3" />
                {t("import.jobs.cancel")}
              </button>
            )}
            {job.status === "failed" && job.attempts < job.max_attempts && (
              <button
                type="button"
                onClick={() => retry.mutate()}
                disabled={retry.isPending}
                className="inline-flex items-center gap-1 rounded-md border border-litera-line/80 px-2 py-1 text-litera-mute hover:bg-litera-line/50 hover:text-litera-text disabled:opacity-60"
              >
                <RefreshCw className="h-3 w-3" />
                {t("import.jobs.retry")}
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

type InboxItem =
  | { kind: "local"; job: ImportJob; updatedAt: number }
  | { kind: "persisted"; job: JobRecord; updatedAt: number };

export function mergeInboxItems(
  localJobs: ImportJob[],
  persistedJobs: JobRecord[]
): InboxItem[] {
  return [
    ...localJobs.map((job) => ({
      kind: "local" as const,
      job,
      updatedAt: job.updatedAt,
    })),
    ...persistedJobs.map((job) => ({
      kind: "persisted" as const,
      job,
      updatedAt: job.updated_at,
    })),
  ].sort((a, b) => b.updatedAt - a.updatedAt);
}

function isActiveInboxItem(item: InboxItem): boolean {
  return item.kind === "local"
    ? isActiveJob(item.job)
    : item.job.status === "queued" || item.job.status === "running";
}

function canMutatePersistedJob(job: JobRecord): boolean {
  return (
    job.status === "running" ||
    (job.status === "failed" && job.attempts < job.max_attempts)
  );
}

function persistedJobProgress(job: JobRecord): ImportJobProgress | undefined {
  if (job.progress_total <= 0) return undefined;
  return { done: job.progress_current, total: job.progress_total };
}

function PersistedJobStatusIcon({ status }: { status: JobStatus }) {
  if (status === "succeeded") {
    return (
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400/90" />
    );
  }
  if (status === "failed") {
    return <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400/90" />;
  }
  if (status === "running") {
    return (
      <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-litera-accent" />
    );
  }
  if (status === "cancelled") {
    return <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-litera-mute" />;
  }
  return <Radio className="mt-0.5 h-4 w-4 shrink-0 text-litera-mute" />;
}

function persistedJobKindLabel(kind: string): string {
  return kind.replace(/_/g, " ");
}

function persistedStatusKey(status: JobStatus): TKey {
  switch (status) {
    case "queued":
      return "import.jobs.status.queued";
    case "running":
      return "import.jobs.status.running";
    case "succeeded":
      return "import.jobs.status.completed";
    case "failed":
      return "import.jobs.status.failed";
    case "cancelled":
      return "import.jobs.status.cancelled";
  }
}

function persistedStatusClassName(status: JobStatus): string {
  switch (status) {
    case "succeeded":
      return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
    case "failed":
      return "border-red-400/30 bg-red-400/10 text-red-200";
    case "running":
      return "border-litera-accent/30 bg-litera-accent/10 text-litera-accent";
    case "cancelled":
      return "border-litera-line bg-litera-bg/70 text-litera-mute";
    case "queued":
      return "border-litera-line bg-litera-bg/70 text-litera-mute";
  }
}

function JobStatusIcon({ status }: { status: ImportJobStatus }) {
  if (status === "completed") {
    return (
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400/90" />
    );
  }
  if (status === "failed") {
    return <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400/90" />;
  }
  if (status === "running") {
    return (
      <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-litera-accent" />
    );
  }
  if (status === "waiting") {
    return <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-amber-300/90" />;
  }
  return <Radio className="mt-0.5 h-4 w-4 shrink-0 text-litera-mute" />;
}

function JobProgress({ progress }: { progress?: ImportJobProgress }) {
  const t = useT();
  if (!progress || progress.total <= 0) return null;

  const percent = Math.min(
    100,
    Math.round((progress.done / progress.total) * 100)
  );

  return (
    <div className="mt-2 text-[11px] text-litera-mute">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="truncate">{progress.label}</span>
        <span className="font-mono">
          {progress.done}/{progress.total}
          {progress.failed
            ? ` · ${t("import.jobs.progressFailed", {
                count: progress.failed,
              })}`
            : ""}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-litera-line">
        <div
          className="h-full rounded-full bg-litera-accent transition-[width] duration-200 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function StepState({
  label,
  status,
}: {
  label: string;
  status: ImportJobStepStatus;
}) {
  const t = useT();
  return (
    <div className="rounded-md bg-litera-bg/50 px-2 py-1">
      <dt className="text-litera-mute">{label}</dt>
      <dd
        className={
          "mt-0.5 inline-flex items-center gap-1 font-medium " +
          stepClassName(status)
        }
      >
        <FileText className="h-3 w-3" />
        {t(stepStatusKey(status))}
      </dd>
    </div>
  );
}

function isActiveJob(job: ImportJob): boolean {
  return (
    job.status === "queued" ||
    job.status === "waiting" ||
    job.status === "running"
  );
}

function sourceKey(source: ImportJobSource): TKey {
  switch (source) {
    case "pdf":
      return "import.jobs.source.pdf";
    case "folder":
      return "import.jobs.source.folder";
    case "doi":
      return "import.jobs.source.doi";
    case "arxiv":
      return "import.jobs.source.arxiv";
    case "rss":
      return "import.jobs.source.rss";
    case "candidate":
      return "import.jobs.source.candidate";
    case "search":
      return "import.jobs.source.search";
  }
}

function statusKey(status: ImportJobStatus): TKey {
  switch (status) {
    case "queued":
      return "import.jobs.status.queued";
    case "waiting":
      return "import.jobs.status.waiting";
    case "running":
      return "import.jobs.status.running";
    case "completed":
      return "import.jobs.status.completed";
    case "failed":
      return "import.jobs.status.failed";
  }
}

function stepStatusKey(status: ImportJobStepStatus): TKey {
  switch (status) {
    case "unknown":
      return "import.jobs.step.unknown";
    case "pending":
      return "import.jobs.step.pending";
    case "checking":
      return "import.jobs.step.checking";
    case "ready":
      return "import.jobs.step.ready";
    case "missing":
      return "import.jobs.step.missing";
    case "running":
      return "import.jobs.step.running";
    case "completed":
      return "import.jobs.step.completed";
    case "failed":
      return "import.jobs.step.failed";
    case "clear":
      return "import.jobs.step.clear";
    case "duplicate":
      return "import.jobs.step.duplicate";
    case "candidate":
      return "import.jobs.step.candidate";
    case "skipped":
      return "import.jobs.step.skipped";
  }
}

function statusClassName(status: ImportJobStatus): string {
  switch (status) {
    case "completed":
      return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
    case "failed":
      return "border-red-400/30 bg-red-400/10 text-red-200";
    case "running":
      return "border-litera-accent/30 bg-litera-accent/10 text-litera-accent";
    case "waiting":
      return "border-amber-400/30 bg-amber-400/10 text-amber-200";
    case "queued":
      return "border-litera-line bg-litera-bg/70 text-litera-mute";
  }
}

function stepClassName(status: ImportJobStepStatus): string {
  switch (status) {
    case "completed":
    case "ready":
    case "clear":
      return "text-emerald-300/90";
    case "failed":
    case "missing":
      return "text-red-300/90";
    case "duplicate":
      return "text-amber-300/90";
    case "running":
    case "checking":
    case "candidate":
      return "text-litera-accent";
    case "pending":
    case "skipped":
    case "unknown":
      return "text-litera-mute";
  }
}
