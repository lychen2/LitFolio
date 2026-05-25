import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2, ExternalLink, Languages, Loader2, Rocket,
} from "lucide-react";
import { api, type ArxivDraft, type Paper, type TranslationResult } from "@/lib/api";
import { useI18n } from "@/i18n/I18nProvider";
import { llmLanguageNameFor } from "@/i18n/dict";

export function DraftRow({
  draft, rank, onOpen,
}: {
  draft: ArxivDraft;
  rank: number;
  onOpen: () => void;
}) {
  const qc = useQueryClient();
  const { lang } = useI18n();
  const [saved, setSaved] = useState<Paper | null>(null);
  const [translation, setTranslation] = useState<TranslationResult | null>(null);
  const add = useMutation({
    mutationFn: () => api.arxivAddWithPdf(draft.arxiv_id!),
    onSuccess: (p) => {
      setSaved(p);
      qc.invalidateQueries({ queryKey: ["papers"] });
    },
  });
  const translate = useMutation({
    mutationFn: () => api.draftTranslate(draft, llmLanguageNameFor(lang)),
    onSuccess: (result) => setTranslation(result),
  });

  return (
    <li className="px-6 py-3.5 hover:bg-litera-panel/40 transition-colors group">
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-7 text-right font-mono text-[11px] tabular-nums text-litera-mute">
          #{rank}
        </div>
        <DraftText
          draft={draft}
          translation={translation}
          addError={add.error}
          translateError={translate.error}
          onOpen={onOpen}
        />
        <DraftActions
          draft={draft}
          saved={saved}
          addPending={add.isPending}
          translatePending={translate.isPending}
          onAdd={() => add.mutate()}
          onTranslate={() => translate.mutate()}
        />
      </div>
    </li>
  );
}

function DraftText({
  draft, translation, addError, translateError, onOpen,
}: {
  draft: ArxivDraft;
  translation: TranslationResult | null;
  addError: Error | null;
  translateError: Error | null;
  onOpen: () => void;
}) {
  return (
    <div className="min-w-0 flex-1">
      <button
        onClick={onOpen}
        className="font-medium text-litera-text leading-snug text-left hover:text-litera-accent"
      >
        {draft.title}
      </button>
      {translation?.title && (
        <div className="text-sm text-litera-accent2 leading-snug mt-1">{translation.title}</div>
      )}
      <DraftMeta draft={draft} />
      {draft.abstract_text && (
        <p className="text-xs text-litera-text/70 mt-1.5 line-clamp-2 leading-relaxed">
          {draft.abstract_text}
        </p>
      )}
      {translation?.abstract_text && (
        <p className="text-xs text-litera-accent2/90 mt-1.5 line-clamp-3 leading-relaxed">
          {translation.abstract_text}
        </p>
      )}
      {translateError && <RowError error={translateError} />}
      {addError && <RowError error={addError} />}
    </div>
  );
}

function DraftMeta({ draft }: { draft: ArxivDraft }) {
  return (
    <div className="text-xs text-litera-mute mt-1 flex items-center gap-2 flex-wrap">
      <span className="truncate max-w-[480px]">
        {draft.authors.slice(0, 4).join(", ")}
        {draft.authors.length > 4 ? " et al." : ""}
      </span>
      {draft.year && <span>· {draft.year}</span>}
      {draft.arxiv_id && (
        <a
          href={`https://arxiv.org/abs/${draft.arxiv_id}`}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-litera-accent2 hover:underline inline-flex items-center gap-0.5"
        >
          arXiv:{draft.arxiv_id} <ExternalLink className="h-2.5 w-2.5" />
        </a>
      )}
    </div>
  );
}

function DraftActions({
  draft, saved, addPending, translatePending, onAdd, onTranslate,
}: {
  draft: ArxivDraft;
  saved: Paper | null;
  addPending: boolean;
  translatePending: boolean;
  onAdd: () => void;
  onTranslate: () => void;
}) {
  return (
    <div className="shrink-0 flex items-center gap-2">
      <button
        onClick={onTranslate}
        disabled={translatePending}
        className="litera-btn text-xs whitespace-nowrap disabled:opacity-50"
        title="使用翻译任务绑定的模型翻译标题和摘要"
      >
        {translatePending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Languages className="h-3.5 w-3.5" />}
        翻译
      </button>
      {saved ? <Saved /> : <AddButton draft={draft} pending={addPending} onClick={onAdd} />}
    </div>
  );
}

function Saved() {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
      <CheckCircle2 className="h-3.5 w-3.5" /> 已入库
    </span>
  );
}

function AddButton({
  draft, pending, onClick,
}: {
  draft: ArxivDraft;
  pending: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={pending || !draft.arxiv_id}
      className="litera-btn text-xs whitespace-nowrap disabled:opacity-50"
      title="从 arxiv.org 下载 PDF 并入库"
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
      下载并入库
    </button>
  );
}

function RowError({ error }: { error: Error }) {
  return <div className="mt-1.5 text-xs text-red-400/90">✕ {error.message}</div>;
}
