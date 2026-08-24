import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, ListPlus, Loader2, Radar, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { CandidateStatusPill } from "@/components/candidates/CandidateStatusPill";
import { useT } from "@/i18n/I18nProvider";
import { api, type CandidatePaper, type Paper, type ResearchProject } from "@/lib/api";

export function ProjectWeeklyReviewPanel({ project }: { project: ResearchProject }) {
  const t = useT();
  const review = useQuery({
    queryKey: ["projects", project.id, "weekly-review"],
    queryFn: () => api.projectWeeklyReview(project.id),
  });

  return (
    <section className="border-t border-litera-line px-6 py-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-lg flex items-center gap-2">
            <Radar className="h-4 w-4 text-litera-accent" />
            {t("projects.weeklyReview")}
          </h2>
          <p className="mt-1 text-xs text-litera-mute">
            {t("projects.weeklyReviewHint")}
          </p>
        </div>
        <button
          onClick={() => review.refetch()}
          disabled={review.isFetching}
          className="litera-btn text-xs disabled:opacity-50"
        >
          {review.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {t("common.refresh")}
        </button>
      </div>
      {review.error && (
        <div className="mb-3 text-xs text-litera-error">{(review.error as Error).message}</div>
      )}
      {review.data ? (
        <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-5">
          <CandidateRadarList
            projectId={project.id}
            candidates={review.data.candidates.map((item) => ({
              ...item.candidate,
              reason: item.reason,
            }))}
            hasTopicTerms={review.data.topic_terms.length > 0}
          />
          <UnreadReminderList papers={review.data.unread_core_papers} />
        </div>
      ) : (
        <div className="border border-litera-line rounded-md p-4 text-sm text-litera-mute">
          {t("common.loading")}
        </div>
      )}
    </section>
  );
}

function CandidateRadarList({
  projectId,
  candidates,
  hasTopicTerms,
}: {
  projectId: number;
  candidates: Array<CandidatePaper & { reason: string }>;
  hasTopicTerms: boolean;
}) {
  const t = useT();
  if (!hasTopicTerms) {
    return <EmptyPanel text={t("projects.weeklyNoTopic")} />;
  }
  if (candidates.length === 0) {
    return <EmptyPanel text={t("projects.weeklyNoCandidates")} />;
  }
  return (
    <div>
      <SectionLabel text={t("projects.weeklyCandidates")} />
      <ul className="mt-2 divide-y divide-litera-line border border-litera-line rounded-md overflow-hidden">
        {candidates.map((candidate) => (
          <CandidateRadarRow key={candidate.id} projectId={projectId} candidate={candidate} />
        ))}
      </ul>
    </div>
  );
}

function CandidateRadarRow({
  projectId,
  candidate,
}: {
  projectId: number;
  candidate: CandidatePaper & { reason: string };
}) {
  const t = useT();
  const qc = useQueryClient();
  const queue = useMutation({
    mutationFn: () => api.candidateSetStatus(candidate.id, "queued"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["candidates"] });
      qc.invalidateQueries({ queryKey: ["projects", projectId, "weekly-review"] });
    },
  });

  return (
    <li className="px-4 py-3 hover:bg-litera-panel/40 transition-colors">
      <div className="flex items-start gap-3">
        <CandidateStatusPill status={candidate.status} />
        <div className="min-w-0 flex-1">
          <div className="text-sm text-litera-text leading-snug">{candidate.title}</div>
          <div className="mt-1 text-[11px] text-litera-mute">{candidate.reason}</div>
          <div className="mt-1 text-[11px] text-litera-mute">
            {candidate.authors.slice(0, 3).join(", ")}
            {candidate.year ? ` · ${candidate.year}` : ""}
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-1.5">
          <button
            onClick={() => queue.mutate()}
            disabled={queue.isPending || candidate.status === "queued"}
            className="litera-btn text-xs disabled:opacity-50"
          >
            {queue.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ListPlus className="h-3.5 w-3.5" />}
            {t("candidate.queue")}
          </button>
          <Link to={candidateImportUrl(candidate)} className="litera-btn text-xs">
            <ExternalLink className="h-3.5 w-3.5" />
            {t("common.import")}
          </Link>
        </div>
      </div>
      {queue.error && <div className="mt-2 text-xs text-litera-error">{(queue.error as Error).message}</div>}
    </li>
  );
}

function UnreadReminderList({
  papers,
}: {
  papers: Array<{ paper: Paper; reason: string }>;
}) {
  const t = useT();
  const qc = useQueryClient();
  const queue = useMutation({
    mutationFn: (paperId: string) => api.queueAdd(paperId, 1),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["queue"] }),
  });

  return (
    <aside>
      <SectionLabel text={t("projects.weeklyUnread")} />
      {papers.length > 0 ? (
        <ul className="mt-2 divide-y divide-litera-line border border-litera-line rounded-md overflow-hidden">
          {papers.map(({ paper, reason }) => (
            <li key={paper.id} className="px-4 py-3 hover:bg-litera-panel/40 transition-colors">
              <Link to={`/reader/${paper.id}`} className="text-sm text-litera-text hover:text-litera-accent leading-snug">
                {paper.title}
              </Link>
              <div className="mt-1 text-[11px] text-litera-mute">{reason}</div>
              <button
                onClick={() => queue.mutate(paper.id)}
                disabled={queue.isPending}
                className="mt-2 litera-btn text-xs disabled:opacity-50"
              >
                <ListPlus className="h-3.5 w-3.5" />
                {t("candidate.queue")}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyPanel text={t("projects.weeklyNoUnread")} />
      )}
      {queue.error && <div className="mt-2 text-xs text-litera-error">{(queue.error as Error).message}</div>}
    </aside>
  );
}

function SectionLabel({ text }: { text: string }) {
  return <div className="text-[11px] uppercase tracking-wider text-litera-mute">{text}</div>;
}

function EmptyPanel({ text }: { text: string }) {
  return (
    <div className="border border-litera-line rounded-md p-4 text-sm text-litera-mute">
      {text}
    </div>
  );
}

function candidateImportUrl(candidate: CandidatePaper) {
  const params = new URLSearchParams({ title: candidate.title });
  params.set("candidateId", String(candidate.id));
  const link = candidate.source_url ?? candidate.doi ?? candidate.arxiv_id ?? "";
  if (link) params.set("link", link);
  return `/import?${params.toString()}`;
}
