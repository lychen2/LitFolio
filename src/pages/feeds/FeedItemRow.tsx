import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  Languages,
  Inbox,
  Spinner,
  Search,
  XCircle,
} from "@/components/icons";
import { openUrl } from "@tauri-apps/plugin-opener";
import { api, type FeedItem, type TranslationResult } from "@/lib/api";
import { useI18n, useT } from "@/i18n/I18nProvider";
import { llmLanguageNameFor } from "@/i18n/dict";
import { CandidateStatusPill } from "@/components/candidates/CandidateStatusPill";
import {
  candidateIsHidden,
  useCandidateLookup,
} from "@/hooks/useCandidateState";
import { feedItemToDraft } from "./feedDraft";
import { upsertFeedImportJob } from "./feedImportJobs";

export function FeedItemRow({
  item,
  feedTitle,
  impactFactor,
  translation,
  onOpen,
  onTranslated,
}: {
  item: FeedItem;
  feedTitle: string;
  impactFactor: number | null;
  translation: TranslationResult | null;
  onOpen: () => void;
  onTranslated: (t: TranslationResult) => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { lang } = useI18n();
  const { findCandidate } = useCandidateLookup();
  const syncedCandidate = findCandidate(feedItemToCandidate(item));
  const seen = useMutation({
    mutationFn: (s: boolean) => api.feedItemSetSeen(item.id, s),
    onSuccess: () => invalidateFeeds(qc),
  });
  const translate = useMutation({
    mutationFn: () =>
      api.draftTranslate(feedItemToDraft(item), llmLanguageNameFor(lang)),
    onSuccess: onTranslated,
  });
  const candidate = useMutation({
    mutationFn: () => {
      upsertFeedImportJob(item, {
        status: "running",
        pdfStatus: "pending",
        duplicateStatus: "checking",
      });
      return api.candidateUpsert(feedItemToCandidate(item));
    },
    onSuccess: (savedCandidate) => {
      upsertFeedImportJob(item, {
        status: "waiting",
        metadataStatus: "ready",
        pdfStatus: "pending",
        duplicateStatus: "candidate",
        candidateId: savedCandidate.id,
      });
      qc.invalidateQueries({ queryKey: ["candidates"] });
      seen.mutate(true);
    },
    onError: (error: Error) => {
      upsertFeedImportJob(item, {
        status: "failed",
        pdfStatus: "skipped",
        duplicateStatus: "unknown",
        error: error.message,
      });
    },
  });
  const fetchMeta = useMutation({
    mutationFn: () => api.feedItemPrepareDraft(item.id),
    onSuccess: () => {
      invalidateFeeds(qc);
    },
  });

  function openExternal() {
    if (!item.link) return;
    seen.mutate(true);
    openUrl(item.link).catch(() => undefined);
  }

  const meta = itemRowMeta(item);
  if (candidateIsHidden(syncedCandidate)) return null;
  return (
    <li
      className={
        "px-4 py-2.5 hover:bg-litera-panel/30 group " +
        (item.seen ? "opacity-70" : "")
      }
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-[1_1_16rem]">
          <button
            onClick={onOpen}
            className="text-sm font-medium text-litera-text leading-snug text-left hover:text-litera-accent"
            title={t("feeds.viewMeta")}
          >
            {!item.seen && (
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-litera-accent mr-2 align-middle" />
            )}
            {meta.title}
            {item.imported_paper_id && (
              <span className="ml-2 inline-flex items-center gap-1 align-middle text-[10px] text-litera-success">
                <Check className="h-3 w-3" />
                {t("feeds.imported")}
              </span>
            )}
            {syncedCandidate && (
              <span className="ml-2 align-middle">
                <CandidateStatusPill status={syncedCandidate.status} />
              </span>
            )}
          </button>
          {translation?.title && (
            <div className="text-xs text-litera-accent2 leading-snug mt-1">
              {translation.title}
            </div>
          )}
          <ItemMetaLine
            feedTitle={feedTitle}
            impactFactor={impactFactor}
            published={meta.published}
            authors={meta.authors}
          />
          {meta.summary && (
            <p className="text-[12px] text-litera-text/70 mt-2 line-clamp-2 leading-relaxed">
              {meta.summary}
            </p>
          )}
          {translation?.abstract_text && (
            <p className="text-[12px] text-litera-accent2/90 mt-1 line-clamp-3 leading-relaxed">
              {translation.abstract_text}
            </p>
          )}
          {translate.error && (
            <div className="mt-1 text-[11px] text-litera-error">
              <XCircle className="mr-1 h-3.5 w-3.5 align-text-bottom" />
              {t("feeds.translateFailedPrefix", {
                message: (translate.error as Error).message,
              })}
            </div>
          )}
          {fetchMeta.error && (
            <div className="mt-1 text-[11px] text-litera-error">
              <XCircle className="mr-1 h-3.5 w-3.5 align-text-bottom" />{(fetchMeta.error as Error).message || "Failed to fetch metadata"}
            </div>
          )}
        </div>
        <ItemActions
          item={item}
          seenPending={seen.isPending}
          translatePending={translate.isPending}
          candidatePending={candidate.isPending}
          metaPending={fetchMeta.isPending}
          onTranslate={() => translate.mutate()}
          onCandidate={() => candidate.mutate()}
          onFetchMeta={() => fetchMeta.mutate()}
          onOpenExternal={openExternal}
          onImport={() =>
            navigate(importUrl(item, syncedCandidate?.id ?? null))
          }
          onToggleSeen={() => seen.mutate(!item.seen)}
        />
      </div>
      {candidate.error && (
        <div className="ml-0 mt-1 text-[11px] text-litera-error">
          <XCircle className="mr-1 h-3.5 w-3.5 align-text-bottom" />{(candidate.error as Error).message}
        </div>
      )}
    </li>
  );
}

function invalidateFeeds(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["feeds"] });
  qc.invalidateQueries({ queryKey: ["feed-items"] });
}

function itemRowMeta(item: FeedItem) {
  return {
    title: item.metadata?.title ?? item.title,
    authors: item.metadata?.authors?.length
      ? item.metadata.authors
      : item.authors,
    summary: item.metadata?.abstract_text?.trim() || item.summary?.trim(),
    published: item.published_at ? new Date(item.published_at * 1000) : null,
  };
}

function ItemMetaLine({
  feedTitle,
  impactFactor,
  published,
  authors,
}: {
  feedTitle: string;
  impactFactor: number | null;
  published: Date | null;
  authors: string[];
}) {
  const t = useT();
  return (
    <div className="text-[11px] text-litera-mute mt-1 flex items-center gap-2 flex-wrap">
      {feedTitle && <span className="truncate max-w-[200px]">{feedTitle}</span>}
      {impactFactor != null && <span>{t("feeds.impactFactor", { value: impactFactor.toFixed(1) })}</span>}
      {published && <span>· {published.toISOString().slice(0, 10)}</span>}
      {authors.length > 0 && (
        <span className="truncate max-w-[280px]">
          · {authors.slice(0, 3).join(", ")}
          {authors.length > 3 ? " et al." : ""}
        </span>
      )}
    </div>
  );
}

function ItemActions({
  item,
  seenPending,
  translatePending,
  candidatePending,
  metaPending,
  onTranslate,
  onCandidate,
  onFetchMeta,
  onOpenExternal,
  onImport,
  onToggleSeen,
}: {
  item: FeedItem;
  seenPending: boolean;
  translatePending: boolean;
  candidatePending: boolean;
  metaPending: boolean;
  onTranslate: () => void;
  onCandidate: () => void;
  onFetchMeta: () => void;
  onOpenExternal: () => void;
  onImport: () => void;
  onToggleSeen: () => void;
}) {
  const t = useT();
  return (
    <div className="flex max-w-full shrink-0 flex-wrap items-center gap-1">
      {!item.metadata && !item.imported_paper_id && (
        <button
          onClick={onFetchMeta}
          disabled={metaPending}
          className="litera-btn px-2 py-0.5 text-xs whitespace-nowrap"
          title={t("feeds.fetchMeta")}
        >
          {metaPending ? (
            <Spinner className="size-5" />
          ) : (
            <Search className="size-5" />
          )}
          {metaPending ? t("feeds.fetchingMeta") : t("feeds.fetchMeta")}
        </button>
      )}
      <button
        onClick={onTranslate}
        disabled={translatePending}
        className="litera-btn px-2 py-0.5 text-xs whitespace-nowrap"
        title={t("feeds.translateTooltip")}
      >
        {translatePending ? (
          <Spinner className="size-5" />
        ) : (
          <Languages className="size-5" />
        )}
        {t("common.translate")}
      </button>
      {item.link && (
        <button
          onClick={onOpenExternal}
          className="litera-btn px-2 py-0.5 text-xs whitespace-nowrap"
          title={t("feeds.openExternal")}
        >
          <ExternalLink className="size-5" /> {t("common.open")}
        </button>
      )}
      {!item.imported_paper_id && (
        <button
          onClick={onCandidate}
          disabled={candidatePending}
          className="litera-btn px-2 py-0.5 text-xs whitespace-nowrap"
          title={t("candidate.add")}
        >
          {candidatePending ? (
            <Spinner className="size-5" />
          ) : (
            <Archive className="size-5" />
          )}
          {t("candidate.addShort")}
        </button>
      )}
      {!item.imported_paper_id && (
        <button
          onClick={onImport}
          className="litera-btn-primary px-2 py-0.5 text-xs whitespace-nowrap"
          title={t("feeds.importGo")}
        >
          <Inbox className="size-5" />
          {t("feeds.importBtn")}
        </button>
      )}
      <button
        onClick={onToggleSeen}
        disabled={seenPending}
        className="litera-icon-btn"
        title={item.seen ? t("feeds.markUnread") : t("feeds.markRead")}
      >
        {seenPending ? (
          <Spinner className="size-5" />
        ) : item.seen ? (
          <EyeOff className="size-5" />
        ) : (
          <Eye className="size-5" />
        )}
      </button>
    </div>
  );
}

function feedItemToCandidate(item: FeedItem) {
  const draft = feedItemToDraft(item);
  return {
    ...draft,
    source_type: "rss",
    source_url: item.link,
  };
}

function importUrl(item: FeedItem, candidateId: number | null) {
  const params = new URLSearchParams({
    fromFeedItem: item.id,
    title: item.title,
  });
  if (candidateId != null) params.set("candidateId", String(candidateId));
  if (item.link) params.set("link", item.link);
  return `/import?${params.toString()}`;
}
