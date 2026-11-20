import { invoke } from "@tauri-apps/api/core";

import type {
  BatchSummary,
  ExpandedQuery,
  ReadStatus,
  SaveTopicSurveyResult,
  TopicSurvey,
} from "./types/api";

export const aiPluginApi = {
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
