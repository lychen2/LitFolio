import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2, ExternalLink, Languages, Spinner, Rocket,
  XCircle,
} from "@/components/icons";
import { api, type ArxivDraft, type Paper, type TranslationResult } from "@/lib/api";
import { useI18n } from "@/i18n/I18nProvider";
import { llmLanguageNameFor } from "@/i18n/dict";
import { useImportedArxivIds } from "@/hooks/useImportedArxivIds";
import { DetailDrawer } from "@/components/DetailDrawer";

export function DraftDetailDrawer({
  draft, translation, onTranslated, onClose,
}: {
  draft: ArxivDraft;
  translation: TranslationResult | null;
  onTranslated: (translation: TranslationResult) => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { lang } = useI18n();
  const [saved, setSaved] = useState<Paper | null>(null);

  const { data: importedIds } = useImportedArxivIds();
  const alreadyImported = useMemo(
    () => importedIds?.includes(draft.arxiv_id ?? "") ?? false,
    [importedIds, draft.arxiv_id],
  );
  const translate = useMutation({
    mutationFn: () => api.draftTranslate(draft, llmLanguageNameFor(lang)),
    onSuccess: onTranslated,
  });
  const add = useMutation({
    mutationFn: () => {
      if (!draft.arxiv_id) throw new Error("Missing arXiv ID");
      return api.arxivAddWithPdf(draft.arxiv_id);
    },
    onSuccess: (paper) => {
      setSaved(paper);
      qc.invalidateQueries({ queryKey: ["papers"] });
    },
  });

  return (
    <DetailDrawer
      title={draft.title}
      eyebrow="arXiv metadata"
      translatedTitle={translation?.title}
      onClose={onClose}
      actions={
        <div className="px-5 py-3 border-b border-litera-line flex items-center gap-2 flex-wrap">
          <button
            onClick={() => translate.mutate()}
            disabled={translate.isPending}
            className="litera-btn text-xs disabled:opacity-50"
          >
            {translate.isPending ? <Spinner className="h-3.5 w-3.5 animate-spin" /> : <Languages className="h-3.5 w-3.5" />}
            翻译标题和摘要
          </button>
          {saved || alreadyImported ? (
            <span className="inline-flex items-center gap-1 text-xs text-litera-success">
              <CheckCircle2 className="h-3.5 w-3.5" /> 已入库
            </span>
          ) : (
            <button
              onClick={() => add.mutate()}
              disabled={add.isPending || !draft.arxiv_id}
              className="litera-btn-primary text-xs disabled:opacity-50"
            >
              {add.isPending ? <Spinner className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
              下载并入库
            </button>
          )}
        </div>
      }
    >
      <Meta draft={draft} />
      <Section title="摘要" body={draft.abstract_text ?? "(无摘要)"} />
      {translation?.abstract_text && <Section title="摘要译文" body={translation.abstract_text} accent />}
      {translate.error && <ErrorLine label="翻译失败" error={translate.error} />}
      {add.error && <ErrorLine label="入库失败" error={add.error} />}
    </DetailDrawer>
  );
}

function Meta({ draft }: { draft: ArxivDraft }) {
  return (
    <dl className="grid grid-cols-[92px_1fr] gap-x-3 gap-y-2 text-sm">
      <dt className="text-litera-mute">作者</dt>
      <dd>{draft.authors.join(", ") || "(unknown)"}</dd>
      <dt className="text-litera-mute">年份</dt>
      <dd>{draft.year ?? "(unknown)"}</dd>
      <dt className="text-litera-mute">Venue</dt>
      <dd>{draft.venue ?? "(unknown)"}</dd>
      <dt className="text-litera-mute">DOI</dt>
      <dd className="font-mono">{draft.doi ?? "(none)"}</dd>
      <dt className="text-litera-mute">arXiv</dt>
      <dd>
        {draft.arxiv_id ? (
          <a
            href={`https://arxiv.org/abs/${draft.arxiv_id}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-litera-accent2 hover:underline inline-flex items-center gap-1"
          >
            {draft.arxiv_id}
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : "(none)"}
      </dd>
    </dl>
  );
}

function Section({ title, body, accent }: { title: string; body: string; accent?: boolean }) {
  return (
    <section>
      <h3 className="text-xs uppercase tracking-wider text-litera-mute mb-2">{title}</h3>
      <p className={"text-sm leading-relaxed whitespace-pre-wrap " + (accent ? "text-litera-accent" : "text-litera-text")}>
        {body}
      </p>
    </section>
  );
}

function ErrorLine({ label, error }: { label: string; error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  return <div className="text-sm text-litera-error"><XCircle className="mr-1 h-3.5 w-3.5 align-text-bottom" />{label}: {message}</div>;
}
