//! Temporary adapter for plugin-owned AI capabilities (Library Ask, batch
//! orchestration, topic survey, query expansion). These methods are split out
//! of the core `apiAiReader` surface and move behind the plugin host/SDK in a
//! later mono phase; the `api` barrel re-spreads them so unmigrated callers
//! keep working until their owning plugin owns the route.

import { invoke } from "@tauri-apps/api/core";

import { parseAskCapabilityState, parseAskSession, parseAskSessionMaybe } from "./apiSchema";
import { invokeParsed } from "./apiInvoke";
import type {
  AskLibraryResult,
  AskSessionDraft,
  BatchSummary,
  ExpandedQuery,
  ReadStatus,
  SaveAskNoteInput,
  SaveAskNoteResult,
  SaveTopicSurveyResult,
  TopicSurvey,
} from "./types/api";

export const aiPluginApi = {
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
