import { invoke } from "@tauri-apps/api/core";

import {
  parseArxivDraft,
  parseCandidatePaper,
  parseFeedItem,
  parseFeedWithCounts,
  parsePdfImportSummary,
  parseTopicAlertResult,
} from "./apiSchema";
import { parseArray } from "./apiSchemaCore";
import { invokeParsed } from "./apiInvoke";
import type {
  CandidateDraft,
  CandidateStatus,
  ExportSummary,
  FeedItemSort,
  FeedRefreshAllSummary,
  FeedRefreshResult,
  NoteSection,
  TopicAlert,
  UnifiedSearchResult,
} from "./types/api";

export const knowledgeApi = {
  feedsList: () =>
    invokeParsed("feeds_list", undefined, (value, path) =>
      parseArray(value, path, parseFeedWithCounts)
    ),
  feedAdd: (url: string) =>
    invokeParsed("feed_add", { url }, parseFeedWithCounts),
  feedRemove: (id: number) => invoke<void>("feed_remove", { id }),
  feedRefresh: (id: number) =>
    invoke<FeedRefreshResult>("feed_refresh", { id }),
  feedRefreshAll: () => invoke<FeedRefreshAllSummary>("feed_refresh_all"),
  feedItemsList: (params: {
    feedId?: number | null;
    onlyUnread?: boolean;
    keyword?: string;
    sort?: FeedItemSort;
    limit?: number;
    offset?: number;
  }) =>
    invokeParsed(
      "feed_items_list",
      {
        feedId: params.feedId ?? null,
        onlyUnread: params.onlyUnread ?? null,
        keyword: params.keyword ?? null,
        sort: params.sort ?? null,
        limit: params.limit ?? null,
        offset: params.offset ?? null,
      },
      (value, path) => parseArray(value, path, parseFeedItem)
    ),
  feedItemSetSeen: (itemId: string, seen: boolean) =>
    invoke<void>("feed_item_set_seen", { itemId, seen }),
  feedMarkAllSeen: (feedId: number) =>
    invoke<void>("feed_mark_all_seen", { feedId }),
  feedItemLinkPaper: (itemId: string, paperId: string) =>
    invoke<void>("feed_item_link_paper", { itemId, paperId }),
  feedItemPrepareDraft: (itemId: string) =>
    invokeParsed("feed_item_prepare_draft", { itemId }, parseArxivDraft),
  bibtexBackfill: () => invoke<number>("bibtex_backfill"),
  exportMarkdownDir: () => invoke<string | null>("export_markdown_dir"),
  exportMarkdownSetDir: (dir: string) =>
    invoke<void>("export_markdown_set_dir", { dir }),
  exportMarkdownAll: (incremental?: boolean) =>
    invoke<ExportSummary>("export_markdown_all", {
      incremental: incremental ?? true,
    }),
  exportMarkdownPaper: (paperId: string) =>
    invoke<string>("export_markdown_paper", { paperId }),
  searchUnified: (query: string, limit?: number) =>
    invoke<UnifiedSearchResult[]>("search_unified", {
      query,
      limit: limit ?? 50,
    }),
  noteSectionsGet: (paperId: string) =>
    invoke<NoteSection[]>("note_sections_get", { paperId }),
  noteSectionsSave: (
    paperId: string,
    sectionKey: string,
    content: string,
    source?: string
  ) =>
    invoke<void>("note_sections_save", {
      paperId,
      sectionKey,
      content,
      source: source ?? "user",
    }),
  noteSectionsReorder: (paperId: string, sectionIds: number[]) =>
    invoke<void>("note_sections_reorder", { paperId, sectionIds }),
  noteSectionDelete: (id: number) =>
    invoke<void>("note_section_delete", { id }),
  exportCitations: (paperIds: string[], format: string) =>
    invoke<string>("export_citations", {
      request: { paper_ids: paperIds, format },
    }),
  candidatesList: (includeIgnored?: boolean) =>
    invokeParsed(
      "candidates_list",
      { includeIgnored: includeIgnored ?? false },
      (value, path) => parseArray(value, path, parseCandidatePaper)
    ),
  candidateUpsert: (draft: CandidateDraft) =>
    invokeParsed("candidate_upsert", { draft }, parseCandidatePaper),
  candidateSetStatus: (id: number, status: CandidateStatus) =>
    invoke<void>("candidate_set_status", { id, status }),
  importFolder: (dirPath: string) =>
    invokeParsed("import_folder", { dirPath }, parsePdfImportSummary),
  topicAlertsList: () => invoke<TopicAlert[]>("topic_alerts_list"),
  topicAlertCreate: (
    query: string,
    frequency: string,
    targetFolderId?: number | null,
    autoImport?: boolean
  ) =>
    invoke<number>("topic_alert_create", {
      query,
      frequency,
      targetFolderId: targetFolderId ?? null,
      autoImport: autoImport ?? false,
    }),
  topicAlertDelete: (id: number) => invoke<void>("topic_alert_delete", { id }),
  topicAlertResultsList: (alertId: number, unseenOnly?: boolean) =>
    invokeParsed(
      "topic_alert_results_list",
      { alertId, unseenOnly: unseenOnly ?? false },
      (value, path) => parseArray(value, path, parseTopicAlertResult)
    ),
  topicAlertResultMarkSeen: (resultId: number) =>
    invoke<void>("topic_alert_result_mark_seen", { resultId }),
  topicAlertMarkAllSeen: (alertId: number) =>
    invoke<void>("topic_alert_mark_all_seen", { alertId }),
  topicAlertUnseenCount: () => invoke<number>("topic_alert_unseen_count"),
  topicAlertRun: (alertId: number) =>
    invoke<number>("topic_alert_run", { alertId }),
  topicAlertRunAll: () => invoke<number>("topic_alert_run_all"),
};
