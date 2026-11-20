import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Spinner } from "@/components/icons";
import { ChoiceButton } from "@/components/ChoiceButton";
import { MarkdownView } from "@/components/MarkdownView";
import { readerClient } from "@/core/data";
import { useI18n, useT } from "@/i18n/I18nProvider";
import { llmLanguageNameFor } from "@/i18n/dict";
import { errorMessage } from "@/lib/error";
import { parseReadingDocument, type ReadingBlock, type ReadingDocument } from "./readingDocument";

/** Shared with the PDF text cache, which invalidates it once extraction changes. */
export function legacyTranslationQueryKey(paperId: string, targetLang: string) {
  return ["paperTranslatedMarkdown", paperId, targetLang] as const;
}

export function legacySourceQueryKey(paperId: string) {
  return ["paperMarkdown", paperId] as const;
}

export interface LegacyTranslation {
  document: ReadingDocument;
  targetLang: string;
}

export interface LegacyTranslationState {
  translation: LegacyTranslation | null;
  isLoading: boolean;
  error: unknown;
}
/**
 * The paper's earlier full-text translation, stored by LitFolio's own
 * translation path before the upstream reader owned translation. Absent for
 * papers translated only inside LitFolio.
 */
export function useLegacyTranslation(paperId: string) {
  const { lang } = useI18n();
  const targetLang = llmLanguageNameFor(lang);
  const query = useQuery({
    queryKey: legacyTranslationQueryKey(paperId, targetLang),
    queryFn: () => readerClient.paperTranslatedMarkdownGet(paperId, targetLang),
    retry: false,
    staleTime: 60_000,
  });
  const translation = useMemo<LegacyTranslation | null>(
    () => (query.data ? { document: parseReadingDocument(query.data.markdown), targetLang: query.data.target_lang } : null),
    [query.data],
  );
  return { translation, isLoading: query.isLoading, error: query.error };
}

type LegacyView = "translation" | "source";

/**
 * Earlier full-text translations stay readable as plain documents. The source
 * and the translation are shown one at a time because the cached Markdown has
 * no shared block identity to align them by.
 */
export function LegacyTranslationPane({
  paperId,
  translation,
  error,
  isLoading,
  onOpenPdfPage,
}: {
  paperId: string;
  translation: LegacyTranslation | null;
  error: unknown;
  isLoading: boolean;
  onOpenPdfPage?: (page: number) => void;
}) {
  const t = useT();
  const [view, setView] = useState<LegacyView>("translation");

  const source = useQuery({
    queryKey: legacySourceQueryKey(paperId),
    queryFn: () => readerClient.paperMarkdownGet(paperId),
    retry: false,
    staleTime: 30_000,
  });
  const original = useMemo(
    () => (source.data ? parseReadingDocument(source.data) : null),
    [source.data],
  );
  const active = view === "source" ? original : translation?.document ?? null;
  const failure = error ?? source.error;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-1.5 border-b border-litera-line px-3 py-1.5">
        <div className="litera-tab-list flex-wrap" role="group" aria-label={t("reader.tabTranslate")}>
          {(["translation", "source"] as const).map((option) => (
            <ChoiceButton
              key={option}
              aria-pressed={view === option}
              disabled={option === "source" ? !original : !translation}
              onClick={() => setView(option)}
              className="text-[11px]"
            >
              {option === "translation" ? t("reader.legacyTranslation") : t("reader.legacySource")}
            </ChoiceButton>
          ))}
        </div>
        {translation && (
          <span className="ml-auto truncate text-[11px] text-litera-mute" title={translation.targetLang}>
            {translation.targetLang}
          </span>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        {isLoading ? (
          <div className="grid h-full place-items-center">
            <Spinner className="h-4 w-4 animate-spin text-litera-mute" aria-hidden="true" />
          </div>
        ) : active ? (
          <ReadableBlocks
            blocks={active.blocks}
            showPages={view === "source" && active.hasPageMarkers}
            onOpenPdfPage={onOpenPdfPage}
          />
        ) : (
          <p className="px-3 py-4 text-xs leading-5 text-litera-mute">{t("reader.legacyMissing")}</p>
        )}
        {failure && (
          <p role="alert" className="litera-reading-alert mx-3 mb-3">
            {errorMessage(failure)}
          </p>
        )}
      </div>
    </div>
  );
}

/** One Markdown block per unit so a page marker stays above the text it covers. */
function ReadableBlocks({
  blocks,
  showPages,
  onOpenPdfPage,
}: {
  blocks: ReadingBlock[];
  showPages: boolean;
  onOpenPdfPage?: (page: number) => void;
}) {
  const t = useT();
  let lastPage: number | null = null;
  return (
    <div className="litera-reading-body markdown-body">
      {blocks
        .filter((block) => !block.artifact)
        .map((block, index) => {
          const page = block.page;
          const pageChanged = showPages && page !== null && page !== lastPage;
          lastPage = page;
          return (
            <div className="litera-reading-block" key={`${index}-${block.kind}`}>
              {pageChanged && page !== null && (
                onOpenPdfPage ? (
                  <button
                    type="button"
                    onClick={() => onOpenPdfPage(page)}
                    className="litera-reading-page litera-reading-page-action"
                    title={t("reader.docOpenPdfPage", { page: String(page) })}
                  >
                    {t("reader.page", { page: String(page) })}
                  </button>
                ) : (
                  <span className="litera-reading-page">{t("reader.page", { page: String(page) })}</span>
                )
              )}
              <MarkdownView content={block.markdown} />
            </div>
          );
        })}
    </div>
  );
}
