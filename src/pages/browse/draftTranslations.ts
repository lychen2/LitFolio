import type { ArxivDraft, TranslationResult } from "@/lib/api";

export function draftTranslationKey(draft: ArxivDraft, targetLang: string): string {
  return `${draft.arxiv_id ?? draft.doi ?? draft.title}::${targetLang}`;
}

export function setDraftTranslation(
  current: ReadonlyMap<string, TranslationResult>,
  draft: ArxivDraft,
  translation: TranslationResult,
): Map<string, TranslationResult> {
  const next = new Map(current);
  next.set(draftTranslationKey(draft, translation.target_lang), translation);
  return next;
}
