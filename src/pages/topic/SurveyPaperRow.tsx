import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Star, Archive, ExternalLink, Loader2, Sparkles } from "lucide-react";
import type { SurveyPaper } from "@/lib/api";
import { api } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";
import { CandidateStatusPill } from "@/components/candidates/CandidateStatusPill";
import { candidateIsHidden, useCandidateLookup } from "@/hooks/useCandidateState";

interface Props {
  paper: SurveyPaper;
  rank: number;
}

export function SurveyPaperRow({ paper, rank }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const { findCandidate } = useCandidateLookup();
  const draft = surveyPaperToCandidate(paper);
  const syncedCandidate = findCandidate(draft);
  const candidate = useMutation({
    mutationFn: () => api.candidateUpsert(draft),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["candidates"] }),
  });
  const cc = paper.citation_count;
  const icc = paper.influential_citation_count;
  if (candidateIsHidden(syncedCandidate)) return null;
  return (
    <li
      id={`paper-${paper.id}`}
      className="px-4 py-3.5 hover:bg-litera-panel/40 transition-colors scroll-mt-4 rounded-sm"
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-12 text-right">
          <div className="font-mono text-xs tabular-nums text-litera-mute">#{rank}</div>
          {paper.must_read && (
            <Star className="h-4 w-4 mt-1 text-amber-400 fill-amber-400 inline" aria-label={t("topic.survey.mustReadAria")} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-litera-text leading-snug">
            {paper.title}
            {syncedCandidate && <span className="ml-2 align-middle"><CandidateStatusPill status={syncedCandidate.status} /></span>}
          </div>
          <div className="text-xs text-litera-mute mt-1 flex items-center gap-2 flex-wrap">
            <span className="truncate max-w-[440px]">
              {paper.authors.slice(0, 3).join(", ")}
              {paper.authors.length > 3 ? " et al." : ""}
            </span>
            {paper.year != null && <span>· {paper.year}</span>}
            {paper.venue && <span className="truncate">· {paper.venue}</span>}
          </div>
          {paper.why_important && (
            <p className="mt-2 text-xs text-litera-accent2 italic border-l-2 border-litera-accent2/40 pl-2.5 leading-relaxed">
              <Sparkles className="inline h-3 w-3 mr-1 -mt-0.5" />
              {paper.why_important}
            </p>
          )}
          {!paper.why_important && paper.abstract_text && (
            <p className="mt-2 text-xs text-litera-text/70 line-clamp-2 leading-relaxed">
              {paper.abstract_text}
            </p>
          )}
          <div className="mt-1.5 flex items-center gap-2 text-[11px] flex-wrap">
            {cc != null && <CiteStat label={t("topic.search.cites")} value={cc.toLocaleString()} />}
            {icc != null && <CiteStat label={t("topic.search.influential")} value={icc.toLocaleString()} dim />}
            {paper.doi && (
              <ExtLink href={`https://doi.org/${paper.doi}`} label="doi" text={paper.doi} />
            )}
            {paper.arxiv_id && (
              <ExtLink href={`https://arxiv.org/abs/${paper.arxiv_id}`} label="arXiv" text={paper.arxiv_id} />
            )}
          </div>
        </div>
        <div className="shrink-0">
          <button
            onClick={() => candidate.mutate()}
            disabled={candidate.isPending}
            title={t("candidate.add")}
            className="litera-btn text-xs whitespace-nowrap disabled:opacity-50 inline-flex items-center gap-1"
          >
            {candidate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
            {t("candidate.addShort")}
          </button>
          {candidate.error && <div className="mt-1 text-[11px] text-red-400/90">{(candidate.error as Error).message}</div>}
        </div>
      </div>
    </li>
  );
}

function surveyPaperToCandidate(paper: SurveyPaper) {
  return {
    title: paper.title,
    authors: paper.authors,
    year: paper.year,
    venue: paper.venue,
    doi: paper.doi,
    arxiv_id: paper.arxiv_id,
    abstract_text: paper.abstract_text,
    source_type: "topic_survey",
    source_url: paper.doi
      ? `https://doi.org/${paper.doi}`
      : paper.arxiv_id
        ? `https://arxiv.org/abs/${paper.arxiv_id}`
        : null,
  };
}

function CiteStat({ label, value, dim }: { label: string; value: string; dim?: boolean }) {
  return (
    <span className={
      "inline-flex items-center gap-1 px-1.5 py-0.5 rounded border " +
      (dim
        ? "border-litera-line text-litera-mute"
        : "border-litera-accent/30 bg-litera-accent/10 text-litera-accent")
    }>
      <span className="font-mono tabular-nums">{value}</span>
      <span className="text-litera-mute">{label}</span>
    </span>
  );
}

function ExtLink({ href, label, text }: { href: string; label: string; text: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-mono text-litera-mute hover:text-litera-accent2 inline-flex items-center gap-0.5"
    >
      {label}:{text}
      <ExternalLink className="h-3 w-3 opacity-60" />
    </a>
  );
}
