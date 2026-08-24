import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, CheckCircle2, FlaskConical, Loader2, Rocket } from "lucide-react";
import { api, type Paper, type SearchHit } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";
import { useImportedArxivIds } from "@/hooks/useImportedArxivIds";
import { CandidateStatusPill } from "@/components/candidates/CandidateStatusPill";
import { candidateIsHidden, useCandidateLookup } from "@/hooks/useCandidateState";

type TopicKind = "recent" | "classic";

export function Column({
  icon, title, subtitle, hits, loading, kind,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  hits: SearchHit[];
  loading: boolean;
  kind: TopicKind;
}) {
  const t = useT();
  return (
    <div className="bg-litera-ink flex flex-col min-h-0">
      <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 border-b border-litera-line bg-litera-ink/95 backdrop-blur">
        <div>
          <div className="text-litera-text font-medium flex items-center gap-2">
            <span className={kind === "recent" ? "text-litera-accent" : "text-litera-accent2"}>{icon}</span>
            {title}
          </div>
          <div className="text-xs text-litera-mute">{t("topic.search.count", { subtitle, count: hits.length })}</div>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-8 text-center text-sm text-litera-mute flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("topic.search.loading")}
          </div>
        ) : hits.length === 0 ? (
          <div className="p-8 text-center text-sm text-litera-mute">
            <FlaskConical className="h-8 w-8 mx-auto mb-2 opacity-50" />
            {t("topic.search.empty")}
          </div>
        ) : (
          <ul className="divide-y divide-litera-line">
            {hits.map((hit, i) => (
              <HitRow key={(hit.paper_id ?? "") + i} h={hit} rank={i + 1} kind={kind} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function HitRow({ h, rank, kind }: { h: SearchHit; rank: number; kind: TopicKind }) {
  const qc = useQueryClient();
  const [saved, setSaved] = useState<Paper | null>(null);
  const { data: importedIds } = useImportedArxivIds();
  const { findCandidate } = useCandidateLookup();
  const candidateDraft = hitToCandidate(h);
  const syncedCandidate = findCandidate(candidateDraft);
  const alreadyImported = useMemo(
    () => importedIds?.includes(h.draft.arxiv_id ?? "") ?? false,
    [importedIds, h.draft.arxiv_id],
  );
  const add = useMutation({
    mutationFn: () => {
      if (!h.draft.arxiv_id) throw new Error("Missing arXiv ID");
      return api.arxivAddWithPdf(h.draft.arxiv_id);
    },
    onSuccess: (paper) => {
      setSaved(paper);
      qc.invalidateQueries({ queryKey: ["papers"] });
    },
  });
  const candidate = useMutation({
    mutationFn: () => api.candidateUpsert(candidateDraft),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["candidates"] }),
  });
  if (candidateIsHidden(syncedCandidate)) return null;
  return (
    <li className="px-5 py-3.5 hover:bg-litera-panel/40 transition-colors group">
      <div className="flex items-start gap-3">
        <div className={"shrink-0 w-7 text-right font-mono text-xs tabular-nums " + rankColor(kind)}>
          #{rank}
        </div>
        <HitBody hit={h} error={add.error ?? candidate.error} candidateStatus={syncedCandidate?.status ?? null} />
        <HitAction
          canAdd={!!h.draft.arxiv_id}
          imported={!!saved || alreadyImported}
          pending={add.isPending}
          candidatePending={candidate.isPending}
          onAdd={() => add.mutate()}
          onCandidate={() => candidate.mutate()}
        />
      </div>
    </li>
  );
}

function HitBody({
  hit,
  error,
  candidateStatus,
}: {
  hit: SearchHit;
  error: unknown;
  candidateStatus: import("@/lib/api").CandidateStatus | null;
}) {
  const t = useT();
  return (
    <div className="min-w-0 flex-1">
      <div className="font-medium text-litera-text leading-snug">
        {hit.draft.title}
        {candidateStatus && <span className="ml-2 align-middle"><CandidateStatusPill status={candidateStatus} /></span>}
      </div>
      <div className="text-xs text-litera-mute mt-1 flex items-center gap-2 flex-wrap">
        <span className="truncate max-w-[440px]">
          {hit.draft.authors.slice(0, 3).join(", ")}{hit.draft.authors.length > 3 ? " et al." : ""}
        </span>
        {hit.draft.year && <span>· {hit.draft.year}</span>}
        {hit.draft.venue && <span className="truncate">· {hit.draft.venue}</span>}
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-[11px] flex-wrap">
        {hit.citation_count != null && <Stat label={t("topic.search.cites")} value={hit.citation_count.toLocaleString()} dim={false} />}
        {hit.influential_citation_count != null && <Stat label={t("topic.search.influential")} value={hit.influential_citation_count.toLocaleString()} dim />}
        {hit.draft.doi && <span className="font-mono text-litera-mute">doi:{hit.draft.doi}</span>}
        {hit.draft.arxiv_id && <span className="font-mono text-litera-mute">arXiv:{hit.draft.arxiv_id}</span>}
      </div>
      {hit.draft.abstract_text && (
        <p className="text-xs text-litera-text/70 mt-2 line-clamp-2 leading-relaxed">
          {hit.draft.abstract_text}
        </p>
      )}
      {errorMessage(error) && (
        <div className="mt-1.5 text-xs text-litera-error">✕ {errorMessage(error)}</div>
      )}
    </div>
  );
}

function hitToCandidate(h: SearchHit) {
  return {
    ...h.draft,
    source_type: "semantic_scholar",
    source_url: h.paper_id ? `https://www.semanticscholar.org/paper/${h.paper_id}` : null,
  };
}

function HitAction({
  canAdd,
  imported,
  pending,
  candidatePending,
  onAdd,
  onCandidate,
}: {
  canAdd: boolean;
  imported: boolean;
  pending: boolean;
  candidatePending: boolean;
  onAdd: () => void;
  onCandidate: () => void;
}) {
  const t = useT();
  if (imported) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-litera-success whitespace-nowrap">
        <CheckCircle2 className="h-3.5 w-3.5" /> {t("topic.search.saved")}
      </span>
    );
  }
  if (!canAdd) {
    return (
      <button
        onClick={onCandidate}
        disabled={candidatePending}
        className="litera-btn text-xs whitespace-nowrap disabled:opacity-50"
        title={t("candidate.add")}
      >
        {candidatePending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
        {t("candidate.addShort")}
      </button>
    );
  }
  return (
    <div className="shrink-0 flex items-center gap-1.5">
      <button
        onClick={onCandidate}
        disabled={candidatePending}
        className="litera-btn text-xs whitespace-nowrap disabled:opacity-50"
        title={t("candidate.add")}
      >
        {candidatePending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
        {t("candidate.addShort")}
      </button>
      <button
        onClick={onAdd}
        disabled={pending}
        className="litera-btn text-xs whitespace-nowrap disabled:opacity-50"
        title={t("topic.search.downloadAndImportTitle")}
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
        {t("topic.search.downloadAndImport")}
      </button>
    </div>
  );
}

function Stat({ label, value, dim }: { label: string; value: string; dim: boolean }) {
  return (
    <span className={"inline-flex items-center gap-1 px-1.5 py-0.5 rounded border " + statColor(dim)}>
      <span className="font-mono tabular-nums">{value}</span>
      <span className="text-litera-mute">{label}</span>
    </span>
  );
}

function rankColor(kind: TopicKind) {
  return kind === "recent" ? "text-litera-accent" : "text-litera-accent2";
}

function statColor(dim: boolean) {
  return dim
    ? "border-litera-line text-litera-mute"
    : "border-litera-accent/30 bg-litera-accent/10 text-litera-accent";
}

function errorMessage(error: unknown): string {
  if (!error) return "";
  return error instanceof Error ? error.message : String(error);
}
