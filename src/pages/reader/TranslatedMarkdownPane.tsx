import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpenText, Columns2, FileText, Languages, Loader2, RefreshCw } from "lucide-react";

import { MarkdownView } from "@/components/MarkdownView";
import { api } from "@/lib/api";
import { useI18n, useT } from "@/i18n/I18nProvider";
import { llmLanguageNameFor } from "@/i18n/dict";
import { parseReadingDocument, type ReadingBlock } from "./readingDocument";

export function translatedMarkdownQueryKey(paperId: string, targetLang: string) {
  return ["paperTranslatedMarkdown", paperId, targetLang] as const;
}

export function translatedMarkdownEstimateQueryKey(paperId: string) {
  return ["paperTranslateMarkdownEstimate", paperId] as const;
}

export function readingOriginalMarkdownQueryKey(paperId: string) {
  return ["paperMarkdown", paperId] as const;
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

type TranslateMarkdownVars = { paperId: string; targetLang: string };

export type ReadingDocMode = "translated" | "original" | "bilingual";

export interface TranslatedMarkdownPaneProps {
  paperId: string;
  paperTitle?: string;
  mode: ReadingDocMode;
  onModeChange: (mode: ReadingDocMode) => void;
  /** Whether the PDF comparison column is open right now. */
  pdfComparisonActive?: boolean;
  /** Toggles the PDF comparison column from the reading toolbar. */
  onTogglePdfComparison?: () => void;
  /** Jumps the PDF reader to a page recorded in the cached source Markdown. */
  onOpenPdfPage?: (page: number) => void;
  /** Opens the original PDF when no extractable text exists. */
  onOpenPdf?: () => void;
}

export function TranslatedMarkdownPane({
  paperId,
  paperTitle,
  mode: requestedMode,
  onModeChange,
  pdfComparisonActive = false,
  onTogglePdfComparison,
  onOpenPdfPage,
  onOpenPdf,
}: TranslatedMarkdownPaneProps) {
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

  const original = useQuery({
    queryKey: readingOriginalMarkdownQueryKey(paperId),
    queryFn: () => api.paperMarkdownGet(paperId),
    staleTime: 30_000,
  });

  const estimate = useQuery({
    queryKey: translatedMarkdownEstimateQueryKey(paperId),
    queryFn: () => api.paperTranslateMarkdownEstimate(paperId),
    enabled: !result && Boolean(original.data),
    staleTime: 30_000,
  });
  const translate = useMutation({
    mutationFn: (vars: TranslateMarkdownVars) => api.paperTranslateMarkdown(vars.paperId, vars.targetLang),
    onSuccess: (fresh, vars) => {
      qc.setQueryData(translatedMarkdownQueryKey(vars.paperId, vars.targetLang), fresh);
      onModeChange("translated");
    },
  });
  const runTranslate = () => translate.mutate({ paperId, targetLang });
  const busy = original.isLoading || (cached.isLoading && !cached.isError) || translate.isPending;

  const translatedDoc = useMemo(() => (result ? parseReadingDocument(result.markdown) : null), [result]);
  const originalMarkdown = original.data ?? null;
  const originalDoc = useMemo(
    () => (originalMarkdown ? parseReadingDocument(originalMarkdown) : null),
    [originalMarkdown],
  );
  const available: Record<ReadingDocMode, boolean> = {
    translated: Boolean(translatedDoc),
    original: Boolean(originalDoc),
    bilingual: Boolean(translatedDoc && originalDoc),
  };
  const hasDocument = available.translated || available.original;
  const mode: ReadingDocMode = available[requestedMode]
    ? requestedMode
    : available.translated
      ? "translated"
      : "original";

  const provenance = result
    ? result.cached || !result.model
      ? t("reader.nativeReadCached", { lang: result.target_lang })
      : t("reader.nativeReadGenerated", { lang: result.target_lang, model: result.model })
    : t("reader.docOriginalTitle");

  // Page numbers come only from `<!-- page:N -->` markers in the cached source
  // text; a translation has its markers stripped, so it never shows pages.
  const showPages = mode !== "translated" && Boolean(originalDoc?.hasPageMarkers);
  const error = translate.error ?? cached.error ?? original.error;

  if (!hasDocument) {
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
              {translate.isPending ? t("reader.nativeReadPreparing") : busy ? t("reader.docOriginalLoading") : t("reader.docOriginalMissing")}
            </p>
            {onOpenPdf && !busy && !originalDoc && (
              <button type="button" onClick={onOpenPdf} className="litera-btn mt-5 text-sm">
                <FileText className="h-4 w-4" aria-hidden="true" />
                {t("reader.showPdf")}
              </button>
            )}
            {error && (
              <p className="litera-reading-alert mt-3" role="alert">
                {errorMessage(error)}
              </p>
            )}
            {originalDoc && (
              <button type="button" onClick={runTranslate} disabled={busy} className="litera-btn mt-5 text-sm">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Languages className="h-4 w-4" aria-hidden="true" />}
                {t("reader.nativeReadGenerate")}
              </button>
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <article className="litera-reading-doc h-full overflow-auto bg-litera-paper">
      <header className="litera-reading-chrome">
        <div className="litera-reading-chrome-row">
          <Languages className="h-4 w-4 shrink-0 text-litera-accent" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-medium text-litera-text">
              {paperTitle ?? t("reader.nativeReadTitle")}
            </h2>
            <p className="truncate text-[11px] text-litera-mute">{provenance}</p>
          </div>
          {onTogglePdfComparison && (
            <button
              type="button"
              onClick={onTogglePdfComparison}
              aria-pressed={pdfComparisonActive}
              title={t("reader.docComparePdf")}
              className={`litera-btn text-xs ${pdfComparisonActive ? "text-litera-accent" : ""}`}
            >
              <Columns2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">{t("reader.docComparePdf")}</span>
            </button>
          )}
          <button type="button" onClick={runTranslate} disabled={translate.isPending} className="litera-btn text-xs">
            {translate.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {result ? t("reader.nativeReadRegenerate") : t("reader.nativeReadGenerate")}
          </button>
        </div>
        {!result && estimate.data && estimate.data.chunk_count > 0 && (
          <p className="litera-reading-note">{t("reader.nativeReadEstimate", { count: String(estimate.data.chunk_count) })}</p>
        )}
        <div className="litera-reading-modes" role="group" aria-label={t("reader.docViewLabel")}>
          {READING_MODE_LABELS.map(({ value, labelKey }) => (
            <button
              type="button"
              key={value}
              onClick={() => onModeChange(value)}
              disabled={!available[value]}
              aria-pressed={mode === value}
              title={available[value] ? undefined : t("reader.docViewUnavailable")}
              className="litera-reading-mode"
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
        {mode === "bilingual" && <p className="litera-reading-note">{t("reader.docViewBilingualBlocked")}</p>}
        {originalDoc === null && !original.isLoading && !original.isError && (
          <p className="litera-reading-note">{t("reader.docOriginalMissing")}</p>
        )}
        {original.isLoading && <p className="litera-reading-note">{t("reader.docOriginalLoading")}</p>}
        {error && (
          <p className="litera-reading-alert" role="alert">
            {errorMessage(error)}
          </p>
        )}
      </header>

      {mode === "bilingual" && originalDoc && translatedDoc ? (
        <BilingualReading original={originalDoc.blocks} translated={translatedDoc.blocks} showPages={originalDoc.hasPageMarkers} onOpenPdfPage={onOpenPdfPage} />
      ) : mode === "original" && originalDoc ? (
        <ReadableBlocks blocks={originalDoc.blocks} showPages={showPages} onOpenPdfPage={onOpenPdfPage} />
      ) : (
        translatedDoc && <ReadableBlocks blocks={translatedDoc.blocks} showPages={false} />
      )}
    </article>
  );
}

const READING_MODE_LABELS = [
  { value: "translated", labelKey: "reader.docViewTranslated" },
  { value: "original", labelKey: "reader.docViewOriginal" },
  { value: "bilingual", labelKey: "reader.docViewBilingual" },
] as const;

function PageMarker({ page, onOpenPdfPage }: { page: number; onOpenPdfPage?: (page: number) => void }) {
  const t = useT();
  const label = t("reader.page", { page: String(page) });
  if (!onOpenPdfPage) {
    return <span className="litera-reading-page">{label}</span>;
  }
  return (
    <button
      type="button"
      onClick={() => onOpenPdfPage(page)}
      className="litera-reading-page litera-reading-page-action"
      title={t("reader.docOpenPdfPage", { page: String(page) })}
    >
      {label}
    </button>
  );
}

/** One Markdown block per reading unit, so a page marker stays with its text. */
function ReadableBlocks({
  blocks,
  showPages,
  onOpenPdfPage,
}: {
  blocks: ReadingBlock[];
  showPages: boolean;
  onOpenPdfPage?: (page: number) => void;
}) {
  let lastPage: number | null = null;
  return (
    <div className="litera-reading-body markdown-body">
      {blocks
        .filter((block) => !block.artifact)
        .map((block, index) => {
          const pageChanged = showPages && block.page !== null && block.page !== lastPage;
          lastPage = block.page;
          return (
            <div className="litera-reading-block" key={`${index}-${block.kind}`}>
              {pageChanged && block.page !== null && (
                <PageMarker page={block.page} onOpenPdfPage={onOpenPdfPage} />
              )}
              <MarkdownView content={block.markdown} />
            </div>
          );
        })}
    </div>
  );
}

function BilingualReading({
  original,
  translated,
  showPages,
  onOpenPdfPage,
}: {
  original: ReadingBlock[];
  translated: ReadingBlock[];
  showPages: boolean;
  onOpenPdfPage?: (page: number) => void;
}) {
  const t = useT();
  return (
    <div className="litera-reading-bilingual-documents">
      <section className="litera-reading-bilingual-column" aria-label={t("reader.docViewOriginal")}>
        <h3 className="litera-reading-bilingual-label">{t("reader.docViewOriginal")}</h3>
        <ReadableBlocks blocks={original} showPages={showPages} onOpenPdfPage={onOpenPdfPage} />
      </section>
      <section className="litera-reading-bilingual-column" aria-label={t("reader.docViewTranslated")}>
        <h3 className="litera-reading-bilingual-label">{t("reader.docViewTranslated")}</h3>
        <ReadableBlocks blocks={translated} showPages={false} />
      </section>
    </div>
  );
}
