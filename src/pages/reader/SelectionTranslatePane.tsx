import { useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { BookMarked, Languages, Loader2, Orbit, Quote } from "lucide-react";
import { api, type ReaderTranslateResult } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";

export function SelectionTranslatePane({
  paperId,
  selectionText,
}: {
  paperId: string;
  selectionText: string;
}) {
  const t = useT();
  const lastRequested = useRef("");
  const translate = useMutation({
    mutationFn: (text: string) => api.readerTranslateSelection(paperId, text),
    retry: false,
  });

  useEffect(() => {
    const trimmed = selectionText.trim();
    if (!trimmed || trimmed === lastRequested.current) {
      return;
    }
    lastRequested.current = trimmed;
    translate.mutate(trimmed);
  }, [selectionText]);

  if (!selectionText.trim()) {
    return (
      <EmptyState />
    );
  }
  if (translate.isPending) {
    return (
      <div className="h-full grid place-items-center text-sm text-litera-mute">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("reader.translating")}
        </div>
      </div>
    );
  }
  if (translate.error) {
    return (
      <div className="p-4 text-sm text-red-400/90">
        <div className="break-all">✕ {t("reader.translateFailed")}: {(translate.error as Error).message}</div>
        <button
          onClick={() => translate.mutate(selectionText)}
          className="litera-btn text-xs px-3 py-1 mt-2"
        >
          {t("common.retry")}
        </button>
      </div>
    );
  }
  if (!translate.data) {
    return null;
  }
  return <TranslateResultView selectionText={selectionText} result={translate.data} />;
}

function EmptyState() {
  const t = useT();
  return (
    <div className="h-full grid place-items-center px-4 text-center">
      <div className="max-w-xs text-sm text-litera-mute">
        <Languages className="h-8 w-8 mx-auto mb-3 text-litera-accent opacity-80" />
        {t("reader.translateEmpty")}
      </div>
    </div>
  );
}

function TranslateResultView({
  selectionText,
  result,
}: {
  selectionText: string;
  result: ReaderTranslateResult;
}) {
  const t = useT();
  return (
    <div className="h-full overflow-auto px-4 py-3 space-y-4">
      <section className="litera-panel p-4">
        <div className="text-xs uppercase tracking-wider text-litera-mute mb-2 flex items-center gap-1.5">
          <Quote className="h-3.5 w-3.5" /> {t("reader.original")}
        </div>
        <p className="text-sm leading-relaxed text-litera-text whitespace-pre-wrap">{selectionText}</p>
      </section>
      <section className="litera-panel p-4">
        <div className="text-xs uppercase tracking-wider text-litera-mute mb-2 flex items-center gap-1.5">
          <Languages className="h-3.5 w-3.5 text-litera-accent" /> {t("reader.translated")}
        </div>
        <p className="text-sm leading-relaxed text-litera-text whitespace-pre-wrap">{result.translation}</p>
        <div className="mt-3 pt-3 border-t border-litera-line text-[11px] text-litera-mute">
          {result.model} · {result.prompt_tokens + result.completion_tokens} tk
        </div>
      </section>
      <section className="litera-panel p-4">
        <div className="text-xs uppercase tracking-wider text-litera-mute mb-3 flex items-center gap-1.5">
          <Orbit className="h-3.5 w-3.5 text-litera-accent2" /> {t("reader.termNetwork")}
        </div>
        {result.terms.length === 0 ? (
          <div className="text-sm text-litera-mute">{t("reader.noTerms")}</div>
        ) : (
          <div className="space-y-4">
            {result.terms.map((term) => (
              <article key={term.term} className="border border-litera-line/80 rounded-lg p-3 bg-litera-paper/40">
                <div className="text-sm font-medium text-litera-text">{term.term}</div>
                <p className="mt-1 text-xs leading-relaxed text-litera-accent2/90">{term.local_definition}</p>
                {term.local_evidence && (
                  <div className="mt-2">
                    <div className="text-[11px] uppercase tracking-wider text-litera-mute">{t("reader.paperEvidence")}</div>
                    <p className="mt-1 text-xs leading-relaxed text-litera-text/75 whitespace-pre-wrap">{term.local_evidence}</p>
                  </div>
                )}
                {term.linked_papers.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <div className="text-[11px] uppercase tracking-wider text-litera-mute">{t("reader.crossReference")}</div>
                    {term.linked_papers.map((paper) => (
                      <Link
                        key={`${term.term}-${paper.paper_id}`}
                        to={`/reader/${paper.paper_id}`}
                        className="block rounded-md border border-litera-line/70 bg-litera-ink/20 px-3 py-2 hover:border-litera-accent/40 hover:bg-litera-panel/70 transition-colors"
                      >
                        <div className="flex items-center gap-2 text-xs text-litera-text">
                          <BookMarked className="h-3.5 w-3.5 text-litera-accent shrink-0" />
                          <span className="font-medium leading-snug">{paper.title}</span>
                        </div>
                        <div className="mt-1 text-[11px] text-litera-mute">
                          {paper.relation}{paper.year ? ` · ${paper.year}` : ""}
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-litera-text/70 whitespace-pre-wrap">{paper.snippet}</p>
                      </Link>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
