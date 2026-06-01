import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Archive, DownloadCloud, ExternalLink, ListPlus, Loader2, SearchX, Star, Trash2 } from "lucide-react";
import { api, type CandidatePaper, type CandidateStatus } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";
import { CandidateStatusPill } from "@/components/candidates/CandidateStatusPill";

export function CandidateInboxPage() {
  const t = useT();
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const { data, isLoading } = useQuery({
    queryKey: ["candidates", "list"],
    queryFn: () => api.candidatesList(false),
  });
  const selectedCandidates = useMemo(
    () => (data ?? []).filter((candidate) => selected.has(candidate.id)),
    [data, selected],
  );

  function toggleCandidate(id: number, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <section className="h-full flex flex-col overflow-hidden">
      <header className="border-b border-litera-line px-6 py-4">
        <h1 className="font-serif text-2xl tracking-tight flex items-center gap-2">
          <Archive className="h-5 w-5 text-litera-accent" />
          {t("candidate.title")}
        </h1>
        <p className="text-sm text-litera-mute">{t("candidate.subtitle")}</p>
      </header>
      {data && data.length > 0 && (
        <CandidateBatchToolbar
          candidates={selectedCandidates}
          onClear={() => setSelected(new Set())}
        />
      )}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="h-full grid place-items-center text-litera-mute">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : data && data.length > 0 ? (
          <ul className="divide-y divide-litera-line">
            {data.map((candidate) => (
              <CandidateRow
                key={candidate.id}
                candidate={candidate}
                selected={selected.has(candidate.id)}
                onSelectedChange={(checked) => toggleCandidate(candidate.id, checked)}
              />
            ))}
          </ul>
        ) : (
          <EmptyState />
        )}
      </div>
    </section>
  );
}

function CandidateBatchToolbar({
  candidates,
  onClear,
}: {
  candidates: CandidatePaper[];
  onClear: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const batch = useMutation({
    mutationFn: (action: BatchAction) => runBatchAction(action, candidates),
    onSuccess: () => {
      onClear();
      qc.invalidateQueries({ queryKey: ["candidates"] });
      qc.invalidateQueries({ queryKey: ["papers"] });
      qc.invalidateQueries({ queryKey: ["imported-arxiv-ids"] });
    },
  });
  const disabled = candidates.length === 0 || batch.isPending;

  return (
    <div className="border-b border-litera-line bg-litera-paper/70 px-6 py-2.5">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-litera-mute">
          {t("candidate.selected", { count: candidates.length })}
        </span>
        <button
          onClick={() => batch.mutate("shortlisted")}
          disabled={disabled}
          className="litera-btn text-xs disabled:opacity-50"
        >
          <Star className="h-3.5 w-3.5" />
          {t("candidate.batchShortlist")}
        </button>
        <button
          onClick={() => batch.mutate("queued")}
          disabled={disabled}
          className="litera-btn text-xs disabled:opacity-50"
        >
          <ListPlus className="h-3.5 w-3.5" />
          {t("candidate.batchQueue")}
        </button>
        <button
          onClick={() => batch.mutate("imported")}
          disabled={disabled}
          className="litera-btn text-xs disabled:opacity-50"
        >
          {batch.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DownloadCloud className="h-3.5 w-3.5" />}
          {t("candidate.batchImport")}
        </button>
        <button
          onClick={() => batch.mutate("ignored")}
          disabled={disabled}
          className="litera-btn text-xs disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {t("candidate.batchIgnore")}
        </button>
        {candidates.length > 0 && (
          <button onClick={onClear} className="text-litera-mute hover:text-litera-text px-1">
            {t("common.cancel")}
          </button>
        )}
      </div>
      {batch.error && (
        <div className="mt-1.5 text-xs text-red-400/90">✕ {(batch.error as Error).message}</div>
      )}
    </div>
  );
}

function CandidateRow({
  candidate,
  selected,
  onSelectedChange,
}: {
  candidate: CandidatePaper;
  selected: boolean;
  onSelectedChange: (checked: boolean) => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const status = useMutation({
    mutationFn: (next: CandidateStatus) => api.candidateSetStatus(candidate.id, next),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["candidates"] }),
  });
  const importHref = importUrl(candidate);

  return (
    <li className="px-6 py-3.5 hover:bg-litera-panel/40 transition-colors">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={(event) => onSelectedChange(event.target.checked)}
          className="mt-1 h-4 w-4 accent-litera-accent"
          aria-label={t("candidate.select")}
        />
        <CandidateStatusPill status={candidate.status} />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-litera-text leading-snug">{candidate.title}</div>
          <div className="text-xs text-litera-mute mt-1 flex items-center gap-2 flex-wrap">
            {candidate.authors.length > 0 && (
              <span className="truncate max-w-[440px]">
                {candidate.authors.slice(0, 3).join(", ")}{candidate.authors.length > 3 ? " et al." : ""}
              </span>
            )}
            {candidate.year && <span>· {candidate.year}</span>}
            <span>· {candidate.source_type}</span>
            {candidate.doi && <span className="font-mono">· doi:{candidate.doi}</span>}
            {candidate.arxiv_id && <span className="font-mono">· arXiv:{candidate.arxiv_id}</span>}
          </div>
          {candidate.abstract_text && (
            <p className="text-xs text-litera-text/70 mt-2 line-clamp-2 leading-relaxed">
              {candidate.abstract_text}
            </p>
          )}
          {status.error && <div className="mt-1.5 text-xs text-red-400/90">✕ {(status.error as Error).message}</div>}
        </div>
        <div className="shrink-0 flex items-center gap-1.5">
          <button
            onClick={() => status.mutate("shortlisted")}
            disabled={status.isPending}
            className="litera-btn text-xs disabled:opacity-50"
          >
            <Star className="h-3.5 w-3.5" />
            {t("candidate.shortlist")}
          </button>
          <button
            onClick={() => status.mutate("queued")}
            disabled={status.isPending}
            className="litera-btn text-xs disabled:opacity-50"
          >
            <ListPlus className="h-3.5 w-3.5" />
            {t("candidate.queue")}
          </button>
          <Link to={importHref} className="litera-btn-primary text-xs">
            <ExternalLink className="h-3.5 w-3.5" />
            {t("common.import")}
          </Link>
          <button
            onClick={() => status.mutate("ignored")}
            disabled={status.isPending}
            className="p-1.5 rounded text-litera-mute hover:text-red-400 hover:bg-red-500/10 disabled:opacity-50"
            title={t("candidate.ignore")}
          >
            {status.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </li>
  );
}

function EmptyState() {
  const t = useT();
  return (
    <div className="h-full grid place-items-center text-center text-litera-mute">
      <div>
        <SearchX className="h-10 w-10 mx-auto mb-3 opacity-50" />
        <p className="text-sm">{t("candidate.empty")}</p>
      </div>
    </div>
  );
}

type BatchAction = "shortlisted" | "queued" | "ignored" | "imported";

async function runBatchAction(action: BatchAction, candidates: CandidatePaper[]) {
  if (candidates.length === 0) return;
  if (action !== "imported") {
    await Promise.all(candidates.map((candidate) => api.candidateSetStatus(candidate.id, action)));
    return;
  }
  const missingArxiv = candidates.filter((candidate) => !candidate.arxiv_id);
  if (missingArxiv.length > 0) {
    throw new Error(`Cannot batch import ${missingArxiv.length} candidate(s) without an arXiv ID.`);
  }
  for (const candidate of candidates) {
    await api.arxivAddWithPdf(candidate.arxiv_id!);
    await api.candidateSetStatus(candidate.id, "imported");
  }
}

function importUrl(candidate: CandidatePaper) {
  const params = new URLSearchParams({ title: candidate.title });
  params.set("candidateId", String(candidate.id));
  const link = candidate.source_url ?? candidate.doi ?? candidate.arxiv_id ?? "";
  if (link) params.set("link", link);
  return `/import?${params.toString()}`;
}
