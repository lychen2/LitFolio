import { invoke } from "@tauri-apps/api/core";

import { parseAskCapabilityState, parseAskSession, parseAskSessionMaybe, parseHighlight, parseLlmConfig } from "./apiSchema";
import { parseArray } from "./apiSchemaCore";
import { invokeParsed } from "./apiInvoke";
import type {
  ArxivDraft,
  AskSessionDraft,
  AskLibraryResult,
  BatchSummary,
  ExpandedQuery,
  LlmConfig,
  LlmProfile,
  LlmTestResult,
  QuickReadResult,
  ReaderPaperTerm,
  ReaderTranslateResult,
  ReaderMarkdownTranslationEstimate,
  ReaderMarkdownTranslationResult,
  ReadStatus,
  SaveAskNoteInput,
  SaveAskNoteResult,
  SaveTopicSurveyResult,
  TldrResult,
  TopicSurvey,
  TranslationResult,
} from "./types/api";

export const aiReaderApi = {
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
  askCapabilityState: () =>
    invokeParsed("ask_capability_state", undefined, parseAskCapabilityState),
  askSessionLatest: (projectId?: number | null) =>
    invokeParsed(
      "ask_session_latest",
      { projectId: projectId ?? null },
      parseAskSessionMaybe
    ),
  askSessionSave: (draft: AskSessionDraft) =>
    invokeParsed("ask_session_save", { draft }, parseAskSession),
  libraryAsk: (
    question: string,
    limit?: number,
    conversationHistory?: { role: string; content: string }[],
    pinnedPaperIds?: string[],
  ) =>
    invoke<AskLibraryResult>("library_ask", {
      question,
      limit: limit ?? null,
      conversationHistory: conversationHistory ?? null,
      pinnedPaperIds: pinnedPaperIds && pinnedPaperIds.length > 0 ? pinnedPaperIds : null,
    }),
  askSaveAsNote: (input: SaveAskNoteInput) =>
    invoke<SaveAskNoteResult>("ask_save_as_note", { input }),
  batchTldr: (ids: string[]) => invoke<BatchSummary>("batch_tldr", { ids }),
  batchQuickRead: (ids: string[]) => invoke<BatchSummary>("batch_quick_read", { ids }),
  batchTranslate: (ids: string[], targetLang?: string) =>
    invoke<BatchSummary>("batch_translate", { ids, targetLang: targetLang ?? "Chinese" }),
  batchAttachTag: (ids: string[], tagId: number) =>
    invoke<number>("batch_attach_tag", { ids, tagId }),
  batchSetStatus: (ids: string[], status: ReadStatus) =>
    invoke<number>("batch_set_status", { ids, status }),
  batchDelete: (ids: string[]) => invoke<number>("batch_delete", { ids }),
  batchCancel: () => invoke<boolean>("batch_cancel"),
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
  noteSave: (paperId: string, content: string) =>
    invoke<void>("note_save", { paperId, content }),
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
  searchExpandQuery: (raw: string) =>
    invoke<ExpandedQuery>("search_expand_query", { raw }),
  topicSurvey: (params: { topic: string; annotate?: boolean; perSubareaTopk?: number }) =>
    invoke<TopicSurvey>("topic_survey", {
      topic: params.topic,
      annotate: params.annotate ?? null,
      perSubareaTopk: params.perSubareaTopk ?? null,
    }),
  topicSurveySaveAsNote: (survey: TopicSurvey) =>
    invoke<SaveTopicSurveyResult>("topic_survey_save_as_note", { survey }),
};
