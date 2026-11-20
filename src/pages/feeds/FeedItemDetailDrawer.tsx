import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Check, ExternalLink, Inbox, Languages, Spinner, XCircle } from "@/components/icons";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  api,
  type ArxivDraft,
  type FeedItem,
  type TranslationResult,
} from "@/lib/api";
import { useI18n, useT } from "@/i18n/I18nProvider";
import { llmLanguageNameFor } from "@/i18n/dict";
import { DetailDrawer } from "@/components/DetailDrawer";
import { feedItemToDraft } from "./feedDraft";
import { upsertFeedImportJob } from "./feedImportJobs";

export function FeedItemDetailDrawer({
  item,
  feedTitle,
  translation,
  onTranslated,
  onClose,
}: {
  item: FeedItem;
  feedTitle: string;
  translation: TranslationResult | null;
  onTranslated: (t: TranslationResult) => void;
  onClose: () => void;
}) {
  const t = useT();
  const navigate = useNavigate();
  const { lang } = useI18n();
  const translate = useMutation({
    mutationFn: () =>
      api.draftTranslate(feedItemToDraft(item), llmLanguageNameFor(lang)),
    onSuccess: onTranslated,
  });
  const draft = useMemo(() => feedItemToDraft(item), [item]);
  const detailSummary =
    draft.abstract_text ?? item.summary ?? t("feeds.noSummary");
  const published = item.published_at
    ? new Date(item.published_at * 1000)
    : null;

  return (
    <DetailDrawer
      title={draft.title}
      eyebrow="RSS metadata"
      translatedTitle={translation?.title}
      onClose={onClose}
      actions={
        <DetailActions
          item={item}
          pending={translate.isPending}
          onTranslate={() => translate.mutate()}
          onImport={() => {
            upsertFeedImportJob(item, {
              status: "waiting",
              pdfStatus: "pending",
              duplicateStatus: "checking",
            });
            navigate(importUrl(item));
          }}
        />
      }
    >
      <Meta
        item={item}
        feedTitle={feedTitle}
        draft={draft}
        published={published}
      />
      <Section title={t("feeds.summarySection")} body={detailSummary} />
      {translation?.abstract_text && (
        <Section
          title={t("feeds.summaryTranslationSection")}
          body={translation.abstract_text}
          accent
        />
      )}
      {translate.error && (
        <div className="text-sm text-litera-error">
          <XCircle className="mr-1 h-3.5 w-3.5 align-text-bottom" />
          {t("feeds.translateFailedPrefix", {
            message: (translate.error as Error).message,
          })}
        </div>
      )}
    </DetailDrawer>
  );
}

function DetailActions({
  item,
  pending,
  onTranslate,
  onImport,
}: {
  item: FeedItem;
  pending: boolean;
  onTranslate: () => void;
  onImport: () => void;
}) {
  const t = useT();
  return (
    <div className="px-5 py-3 border-b border-litera-line flex items-center gap-2 flex-wrap">
      <button
        onClick={onTranslate}
        disabled={pending}
        className="litera-btn text-xs disabled:opacity-50"
      >
        {pending ? (
          <Spinner className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Languages className="h-3.5 w-3.5" />
        )}
        {t("feeds.translateTitleAbstract")}
      </button>
      {item.link && (
        <button
          onClick={() => openUrl(item.link!).catch(() => undefined)}
          className="litera-btn text-xs"
        >
          <ExternalLink className="h-3.5 w-3.5" /> {t("feeds.openExternal")}
        </button>
      )}
      {!item.imported_paper_id && (
        <button onClick={onImport} className="litera-btn-primary text-xs">
          <Inbox className="h-3.5 w-3.5" />
          {t("feeds.importBtnLong")}
        </button>
      )}
      {item.imported_paper_id && (
        <span className="inline-flex items-center gap-1 text-xs text-litera-success">
          <Check className="h-3.5 w-3.5" />
          {t("feeds.imported")}
        </span>
      )}
    </div>
  );
}

function Meta({
  item,
  feedTitle,
  draft,
  published,
}: {
  item: FeedItem;
  feedTitle: string;
  draft: ArxivDraft;
  published: Date | null;
}) {
  const t = useT();
  return (
    <dl className="grid grid-cols-[92px_1fr] gap-x-3 gap-y-2 text-sm">
      <dt className="text-litera-mute">{t("feeds.metaFeed")}</dt>
      <dd>{feedTitle || "—"}</dd>
      <dt className="text-litera-mute">{t("feeds.metaAuthors")}</dt>
      <dd>{item.authors.join(", ") || t("feeds.metaUnknown")}</dd>
      <dt className="text-litera-mute">{t("feeds.metaPublished")}</dt>
      <dd>
        {published
          ? published.toISOString().slice(0, 10)
          : t("feeds.metaUnknown")}
      </dd>
      <dt className="text-litera-mute">{t("feeds.metaLink")}</dt>
      <dd className="font-mono break-all">
        <ExternalLinkValue link={item.link} emptyLabel={t("feeds.metaNone")} />
      </dd>
      {draft.arxiv_id && (
        <>
          <dt className="text-litera-mute">arXiv</dt>
          <dd className="font-mono">{draft.arxiv_id}</dd>
        </>
      )}
      {draft.doi && (
        <>
          <dt className="text-litera-mute">DOI</dt>
          <dd className="font-mono">{draft.doi}</dd>
        </>
      )}
    </dl>
  );
}

function ExternalLinkValue({
  link,
  emptyLabel,
}: {
  link: string | null;
  emptyLabel: string;
}) {
  if (!link) return emptyLabel;
  return (
    <a
      href={link}
      onClick={(e) => {
        e.preventDefault();
        openUrl(link).catch(() => undefined);
      }}
      className="text-litera-accent2 hover:underline inline-flex items-center gap-1"
    >
      {link} <ExternalLink className="h-3 w-3" />
    </a>
  );
}

function Section({
  title,
  body,
  accent,
}: {
  title: string;
  body: string;
  accent?: boolean;
}) {
  return (
    <section>
      <h3 className="text-xs uppercase tracking-wider text-litera-mute mb-2">
        {title}
      </h3>
      <p
        className={
          "text-sm leading-relaxed whitespace-pre-wrap " +
          (accent ? "text-litera-accent" : "text-litera-text")
        }
      >
        {body}
      </p>
    </section>
  );
}

function importUrl(item: FeedItem) {
  const params = new URLSearchParams({
    fromFeedItem: item.id,
    title: item.title,
  });
  if (item.link) params.set("link", item.link);
  return `/import?${params.toString()}`;
}
