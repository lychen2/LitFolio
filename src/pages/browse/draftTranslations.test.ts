import { describe, expect, it } from "vitest";
import type { ArxivDraft, TranslationResult } from "@/lib/api";
import { draftTranslationKey, setDraftTranslation } from "./draftTranslations";

const translation: TranslationResult = {
  title: "译文标题",
  abstract_text: "译文摘要",
  target_lang: "Chinese",
  model: "test-model",
  prompt_tokens: 10,
  completion_tokens: 5,
};

function draft(overrides: Partial<ArxivDraft> = {}): ArxivDraft {
  return {
    title: "Original title",
    authors: ["A. Author"],
    year: 2026,
    venue: "arXiv",
    doi: null,
    arxiv_id: "2601.00001",
    abstract_text: "Original abstract",
    ...overrides,
  };
}

describe("draft translation cache", () => {
  it("uses one key for row and metadata drawer translation state", () => {
    const source = draft();

    const next = setDraftTranslation(new Map(), source, translation);

    expect(next.get(draftTranslationKey(source, "Chinese"))).toEqual(translation);
  });

  it("separates cached translations by target language", () => {
    const source = draft();

    const next = setDraftTranslation(new Map(), source, translation);

    expect(next.get(draftTranslationKey(source, "English"))).toBeUndefined();
  });

  it("falls back to DOI and title for non-arXiv metadata", () => {
    expect(draftTranslationKey(draft({ arxiv_id: null, doi: "10.1145/123" }), "Chinese")).toBe("10.1145/123::Chinese");
    expect(draftTranslationKey(draft({ arxiv_id: null, doi: null, title: "Untitled DOI-free" }), "Chinese")).toBe("Untitled DOI-free::Chinese");
  });
});
