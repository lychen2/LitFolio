import { useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, FileText, Languages, Loader2, Paperclip, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { type Paper } from "@/lib/api";
import { useI18n } from "@/i18n/I18nProvider";
import type { PaperActionsState } from "./usePaperActions";

/// Action button cluster for a library row: open/attach/read on the primary
/// line, then translate / tldr / deep-read / re-attach / delete as compact
/// icon buttons. State and mutations come from usePaperActions.
export function PaperActions({
  p, actions, onQuickRead,
}: {
  p: Paper;
  actions: PaperActionsState;
  onQuickRead: (p: Paper) => void;
}) {
  const { t } = useI18n();
  const { tldr, translate, attachPdf, del, openMut, canOpenPdf, openPdf } = actions;
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex shrink-0 flex-col items-end gap-1 opacity-80 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
      <div className="flex items-center gap-1.5">
        {canOpenPdf ? (
          <button
            onClick={openPdf}
            disabled={openMut.isPending}
            className="litera-btn text-xs whitespace-nowrap disabled:opacity-60"
            title={t("library.openPdfTitle")}
          >
            {openMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
            {t("library.openPdf")}
          </button>
        ) : (
          <button
            onClick={() => attachPdf.mutate(undefined)}
            disabled={attachPdf.isPending}
            className="litera-btn-primary text-xs whitespace-nowrap disabled:opacity-50"
            title={t("library.attachPdfTitle")}
          >
            {attachPdf.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
            {t("library.attachPdf")}
          </button>
        )}
        {canOpenPdf && (
          <Link to={`/reader/${p.id}`} className="litera-btn text-xs whitespace-nowrap" title={t("library.readPdfTitle")}>
            <BookOpen className="h-3.5 w-3.5" /> {t("library.readPdf")}
          </Link>
        )}
      </div>
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => translate.mutate()}
          disabled={translate.isPending}
          className="litera-icon-btn h-7 w-7"
          title={p.title_translated ? t("library.retranslateTitle") : t("library.translateTitle")}
          aria-label={p.title_translated ? t("library.retranslateTitle") : t("library.translateTitle")}
        >
          {translate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Languages className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={() => tldr.mutate()}
          disabled={tldr.isPending}
          className="litera-icon-btn h-7 w-7"
          title={t("library.tldrTitle")}
          aria-label={t("library.tldrTitle")}
        >
          {tldr.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={() => onQuickRead(p)}
          className="litera-icon-btn h-7 w-7"
          title={t("library.deepReadTitle")}
          aria-label={t("library.deepReadTitle")}
        >
          <BookOpen className="h-3.5 w-3.5" />
        </button>
        {canOpenPdf && (
          <button
            onClick={() => attachPdf.mutate(undefined)}
            disabled={attachPdf.isPending}
            className="litera-icon-btn h-7 w-7 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
            title={t("library.attachPdfTitle")}
            aria-label={t("library.attachPdfTitle")}
          >
            {attachPdf.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </button>
        )}
        {confirming ? (
          <>
            <button
              onClick={() => { setConfirming(false); del.mutate(); }}
              disabled={del.isPending}
              className="px-1.5 py-0.5 rounded text-[10px] bg-litera-error/15 text-litera-error hover:bg-litera-error/25 disabled:opacity-50 inline-flex items-center gap-1"
              title={t("library.confirmDelete", { title: p.title, id: p.id })}
            >
              {del.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              {t("common.delete")}
            </button>
            <button onClick={() => setConfirming(false)} className="px-1.5 py-0.5 rounded text-[10px] text-litera-mute hover:text-litera-text">
              {t("common.cancel")}
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            disabled={del.isPending}
            className="litera-icon-btn h-7 w-7 opacity-0 hover:bg-litera-error/10 hover:text-litera-error group-hover:opacity-100 group-focus-within:opacity-100"
            title={t("library.deleteTitle")}
            aria-label={t("library.deleteTitle")}
          >
            {del.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
    </div>
  );
}
