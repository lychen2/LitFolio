import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpenText, Languages, Loader2, RefreshCw } from "lucide-react";

import { MarkdownView } from "@/components/MarkdownView";
import { api } from "@/lib/api";
import { useI18n, useT } from "@/i18n/I18nProvider";
import { llmLanguageNameFor } from "@/i18n/dict";

export function translatedMarkdownQueryKey(paperId: string, targetLang: string) {
  return ["paperTranslatedMarkdown", paperId, targetLang] as const;
}

export function translatedMarkdownEstimateQueryKey(paperId: string) {
  return ["paperTranslateMarkdownEstimate", paperId] as const;
}
export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

type TranslateMarkdownVars = { paperId: string; targetLang: string };

export function TranslatedMarkdownPane({ paperId, paperTitle }: { paperId: string; paperTitle?: string }) {
  const t = useT();
  const { lang } = useI18n();
  const targetLang = llmLanguageNameFor(lang);
  const queryKey = useMemo(() => translatedMarkdownQueryKey(paperId, targetLang), [paperId, targetLang]);
  const qc = useQueryClient();
  const cached = useQuery({
    queryKey,
    queryFn: () => api.paperTranslatedMarkdownGet(paperId, targetLang),
    refetchOnMount: "always",
  });
  const result = cached.data ?? null;
  const estimate = useQuery({
    queryKey: translatedMarkdownEstimateQueryKey(paperId),
    queryFn: () => api.paperTranslateMarkdownEstimate(paperId),
    enabled: !result,
    staleTime: 30_000,
  });
  const translate = useMutation({
    mutationFn: ({ paperId, targetLang }: TranslateMarkdownVars) => api.paperTranslateMarkdown(paperId, targetLang),
    onSuccess: (result, vars) => qc.setQueryData(translatedMarkdownQueryKey(vars.paperId, vars.targetLang), result),
  });
  const runTranslate = () => translate.mutate({ paperId, targetLang });


  const busy = (cached.isLoading && !cached.isError) || translate.isPending;

  if (result) {
    return (
      <article className="h-full overflow-auto bg-litera-paper">
        <div className="sticky top-0 z-10 border-b border-litera-line bg-litera-paper/95 px-5 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-4xl items-center gap-3">
            <Languages className="h-4 w-4 text-litera-accent" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-medium text-litera-text">{paperTitle ?? t("reader.nativeReadTitle")}</h2>
              <p className="truncate text-[11px] text-litera-mute">
                {result.cached || !result.model
                  ? t("reader.nativeReadCached", { lang: result.target_lang })
                  : t("reader.nativeReadGenerated", { lang: result.target_lang, model: result.model })}
              </p>
            </div>
            <button
              type="button"
              onClick={runTranslate}
              disabled={translate.isPending}
              className="litera-btn text-xs"
            >
              {translate.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {t("reader.nativeReadRegenerate")}
            </button>
          </div>
          {translate.error && (
            <p className="mx-auto mt-2 max-w-4xl rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300" role="alert">
              {errorMessage(translate.error)}
            </p>
          )}
        </div>
        <div className="mx-auto max-w-4xl px-6 py-6 md:px-10 md:py-8">
          <MarkdownView
            content={result.markdown}
            className="markdown-body text-[15px] leading-8 text-litera-text [&_h1]:font-serif [&_h1]:text-2xl [&_h1]:leading-tight [&_h2]:mt-8 [&_h2]:font-serif [&_h2]:text-xl [&_h3]:mt-6 [&_h3]:font-medium [&_p]:my-4 [&_li]:my-1.5 [&_blockquote]:border-l [&_blockquote]:border-litera-accent/40 [&_blockquote]:pl-4 [&_blockquote]:text-litera-mute"
          />
        </div>
      </article>
    );
  }

  return (
    <section className="h-full overflow-auto bg-litera-paper">
      <div className="mx-auto grid min-h-full max-w-2xl place-items-center px-6 py-10 text-center">
        <div>
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-litera-accent/25 bg-litera-accent/10 text-litera-accent">
            {busy ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            ) : (
              <BookOpenText className="h-5 w-5" aria-hidden="true" />
            )}
          </div>
          <h2 className="font-serif text-xl text-litera-text">{t("reader.nativeReadTitle")}</h2>
          <p className="mt-2 text-sm leading-6 text-litera-mute">
            {busy ? t("reader.nativeReadPreparing") : t("reader.nativeReadEmpty")}
          </p>
          {estimate.data && estimate.data.chunk_count > 0 && !busy && (
            <p className="mt-3 text-xs text-litera-mute">
              {t("reader.nativeReadEstimate", { count: String(estimate.data.chunk_count) })}
            </p>
          )}
          {cached.isError && (
            <p className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300" role="alert">
              {errorMessage(cached.error)}
            </p>
          )}
          {translate.error && (
            <p className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300" role="alert">
              {errorMessage(translate.error)}
            </p>
          )}
          <button
            type="button"
            onClick={runTranslate}
            disabled={busy}
            className="litera-btn mt-5 text-sm"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Languages className="h-4 w-4" aria-hidden="true" />}
            {t("reader.nativeReadGenerate")}
          </button>
        </div>
      </div>
    </section>
  );
}
