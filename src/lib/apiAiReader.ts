import { invoke } from "@tauri-apps/api/core";

import { parseHighlight, parseLlmConfig } from "./apiSchema";
import {
  parseAiExecutionRecord,
  parseReaderAskResult,
  type AiExecutionRecord,
} from "./apiSchemaAi";
import { parseNoteSaveResult, type NoteSaveResult } from "./apiSchemaProvenance";
import { parseArray } from "./apiSchemaCore";
import { invokeParsed } from "./apiInvoke";
import type {
  ArxivDraft,
  LlmConfig,
  LlmProfile,
  LlmTestResult,
  QuickReadResult,
  ReaderPaperTerm,
  ReaderTranslateResult,
  ReaderMarkdownTranslationEstimate,
  ReaderMarkdownTranslationResult,
  TldrResult,
  TranslationResult,
} from "./types/api";

export const aiReaderApi = {
  readerAskPaper: (input: { request: { paperId: string; selection?: { text: string } | null; highlightId?: string | null; revisionId?: string | null; maxBodyChars?: number | null }; question: string }) =>
    invokeParsed("reader_ask_paper", { input }, parseReaderAskResult),
  llmGetConfig: () => invokeParsed("llm_get_config", undefined, parseLlmConfig),
  llmSaveConfig: (config: LlmConfig) =>
    invoke<void>("llm_save_config", { config }),
  llmTest: (profile: LlmProfile) =>
    invoke<LlmTestResult>("llm_test", { profile }),
  paperTldr: (id: string) => invoke<TldrResult>("paper_tldr", { id }),
  paperQuickRead: (id: string) =>
    invoke<QuickReadResult>("paper_quick_read", { id }),
  paperTranslate: (id: string, targetLang?: string) =>
    invoke<TranslationResult>("paper_translate", {
      id,
      targetLang: targetLang ?? "Chinese",
    }),
  draftTranslate: (draft: ArxivDraft, targetLang?: string) =>
    invoke<TranslationResult>("draft_translate", {
      draft,
      targetLang: targetLang ?? "Chinese",
    }),
  highlightCreate: (
    paperId: string,
    page: number,
    rect: unknown,
    text: string,
    color?: string,
    label?: string,
  ) =>
    invokeParsed(
      "highlight_create",
      { paperId, page, rect, text, color: color ?? null, label: label ?? null },
      parseHighlight,
    ),
  highlightList: (paperId: string) =>
    invokeParsed("highlight_list", { paperId }, (value, path) =>
      parseArray(value, path, parseHighlight),
    ),
  highlightUpdateNote: (id: string, note: string | null) =>
    invoke<void>("highlight_update_note", { id, note }),
  highlightUpdateRect: (id: string, rect: unknown) =>
    invoke<void>("highlight_update_rect", { id, rect }),
  highlightUpdateLabel: (id: string, label: string | null) =>
    invoke<void>("highlight_update_label", { id, label }),
  highlightSummarize: (id: string) =>
    invokeParsed("highlight_summarize", { highlightId: id }, parseHighlight),
  highlightTranslate: (id: string, targetLang?: string) =>
    invokeParsed(
      "highlight_translate",
      { highlightId: id, targetLang: targetLang ?? "Chinese" },
      parseHighlight,
    ),
  highlightExplain: (id: string) =>
    invokeParsed("highlight_explain", { highlightId: id }, parseHighlight),
  highlightDelete: (id: string) => invoke<void>("highlight_delete", { id }),
  noteGet: (paperId: string) => invoke<string>("note_get", { paperId }),
  noteSave: (paperId: string, content: string, expectedRevision?: number | null): Promise<NoteSaveResult> =>
    invokeParsed(
      "note_save",
      { paperId, content, expectedRevision: expectedRevision ?? null },
      parseNoteSaveResult,
    ),
  readerTranslateSelection: (paperId: string, selection: string, targetLang?: string) =>
    invoke<ReaderTranslateResult>("reader_translate_selection", {
      paperId,
      selection,
      targetLang: targetLang ?? "Chinese",
    }),
  paperTranslatedMarkdownGet: (paperId: string, targetLang?: string) =>
    invoke<ReaderMarkdownTranslationResult | null>("paper_translated_markdown_get", {
      paperId,
      targetLang: targetLang ?? null,
    }),
  paperTranslateMarkdownEstimate: (paperId: string) =>
    invoke<ReaderMarkdownTranslationEstimate | null>("paper_translate_markdown_estimate", {
      paperId,
    }),
  paperTranslateMarkdown: (paperId: string, targetLang?: string) =>
    invoke<ReaderMarkdownTranslationResult>("paper_translate_markdown", {
      paperId,
      targetLang: targetLang ?? null,
    }),
  paperTermsList: (paperId: string) =>
    invoke<ReaderPaperTerm[]>("paper_terms_list", { paperId }),
  paperTermsGenerate: (paperId: string) =>
    invoke<ReaderPaperTerm[]>("paper_terms_generate", { paperId }),
  paperTermsGenerateCandidates: (paperId: string) =>
    invoke<ReaderPaperTerm[]>("paper_terms_generate_candidates", { paperId }),
  paperTermsExplain: (paperId: string) =>
    invoke<ReaderPaperTerm[]>("paper_terms_explain", { paperId }),
  paperTermAdd: (
    paperId: string,
    term: string,
    definition?: string | null,
    evidence?: string | null,
  ) =>
    invoke<ReaderPaperTerm>("paper_term_add", {
      paperId,
      term,
      definition: definition ?? null,
      evidence: evidence ?? null,
    }),
  paperTermDelete: (paperId: string, termId: number) =>
    invoke<void>("paper_term_delete", { paperId, termId }),
  paperSetPdfText: (paperId: string, text: string) =>
    invoke<void>("paper_set_pdf_text", { paperId, text }),
  llmListModels: (profile: LlmProfile) =>
    invoke<string[]>("llm_list_models", { profile }),
  llmPullModel: (profile: LlmProfile, model: string) =>
    invoke<string>("llm_pull_model", { profile, model }),
  aiListRunningExecutions: () =>
    invokeParsed<AiExecutionRecord[]>(
      "ai_list_running_executions",
      undefined,
      (value, path) => parseArray(value, path, parseAiExecutionRecord),
    ),
  aiCancelExecution: (executionId: string) =>
    invoke<boolean>("ai_cancel_execution", { executionId }),
};
