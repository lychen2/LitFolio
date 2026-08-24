import { invoke } from "@tauri-apps/api/core";

import {
  parseArxivDraft,
  parseCandidatePaper,
  parseEvidenceItem,
  parseFeedItem,
  parseFeedWithCounts,
  parseGraphData,
  parsePaper,
  parsePdfImportSummary,
  parseResearchProject,
  parseTopicAlertResult,
} from "./apiSchema";
import { parseArray, parseNullable } from "./apiSchemaCore";
import { invokeParsed } from "./apiInvoke";
import type {
  CandidateDraft,
  CandidateStatus,
  Concept,
  ConceptRelation,
  CustomFieldDef,
  DuplicatePair,
  EvidenceDraft,
  ExportSummary,
  ExtractedConcept,
  FeedRefreshAllSummary,
  FeedRefreshResult,
  FilterRule,
  GraphFilter,
  LinkBatchSummary,
  LitReviewResult,
  NoteSection,
  PaperComparison,
  PaperConcept,
  PaperCustomField,
  PaperLink,
  ProjectDraft,
  ProjectSourceManifest,
  ProjectWeeklyReview,
  ProjectWritingOutline,
  QueueEntry,
  Recommendation,
  SmartCollection,
  TopicAlert,
  UnifiedSearchResult,
  CitationGraph,
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
    limit?: number;
    offset?: number;
  }) =>
    invokeParsed(
      "feed_items_list",
      {
        feedId: params.feedId ?? null,
        onlyUnread: params.onlyUnread ?? null,
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
  graphData: (filter?: GraphFilter) =>
    invokeParsed("graph_data", { filter: filter ?? {} }, parseGraphData),
  paperLinkCreate: (
    sourcePaperId: string,
    targetPaperId: string,
    relation: string,
    snippet?: string | null
  ) =>
    invoke<PaperLink>("paper_link_create", {
      sourcePaperId,
      targetPaperId,
      relation,
      snippet: snippet ?? null,
    }),
  paperLinkCreateOrGet: (
    sourcePaperId: string,
    targetPaperId: string,
    relation: string,
    snippet?: string | null
  ) =>
    invoke<PaperLink>("paper_link_create_or_get", {
      sourcePaperId,
      targetPaperId,
      relation,
      snippet: snippet ?? null,
    }),
  paperLinkDelete: (id: number) => invoke<void>("paper_link_delete", { id }),
  paperLinksForPaper: (paperId: string) =>
    invoke<PaperLink[]>("paper_links_for_paper", { paperId }),
  aiDiscoverLinks: (paperIds?: string[]) =>
    invoke<LinkBatchSummary>("ai_discover_links", {
      paperIds: paperIds ?? null,
    }),
  aiAcceptLink: (linkId: number) => invoke<void>("ai_accept_link", { linkId }),
  aiRejectLink: (linkId: number) => invoke<void>("ai_reject_link", { linkId }),
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
  obsidianExportAll: () => invoke<ExportSummary>("obsidian_export_all"),
  searchUnified: (query: string, limit?: number) =>
    invoke<UnifiedSearchResult[]>("search_unified", {
      query,
      limit: limit ?? 50,
    }),
  paperComparisonsList: () =>
    invoke<PaperComparison[]>("paper_comparisons_list"),
  paperComparisonGet: (id: number) =>
    invoke<PaperComparison | null>("paper_comparison_get", { id }),
  paperComparisonCreate: (paperIds: string[], content: string, model: string) =>
    invoke<number>("paper_comparison_create", { paperIds, content, model }),
  paperComparisonGenerate: (paperIds: string[]) =>
    invoke<PaperComparison>("paper_comparison_generate", { paperIds }),
  paperComparisonUpdate: (id: number, content: string) =>
    invoke<void>("paper_comparison_update", { id, content }),
  paperComparisonDelete: (id: number) =>
    invoke<void>("paper_comparison_delete", { id }),
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
  paperSimilar: (id: string) =>
    invoke<Recommendation[]>("paper_similar", { id }),
  exportCitations: (paperIds: string[], format: string) =>
    invoke<string>("export_citations", {
      request: { paper_ids: paperIds, format },
    }),
  paperCitations: (id: string) =>
    invoke<CitationGraph>("paper_citations", { id }),
  queueList: () => invoke<QueueEntry[]>("queue_list"),
  queueAdd: (
    paperId: string,
    priority?: number,
    targetDate?: number,
    note?: string
  ) =>
    invoke<void>("queue_add", {
      paperId,
      priority: priority ?? 0,
      targetDate: targetDate ?? null,
      note: note ?? null,
    }),
  queueRemove: (paperId: string) => invoke<void>("queue_remove", { paperId }),
  queueUpdate: (
    paperId: string,
    priority: number,
    targetDate?: number,
    note?: string
  ) =>
    invoke<void>("queue_update", {
      paperId,
      priority,
      targetDate: targetDate ?? null,
      note: note ?? null,
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
  projectsList: () =>
    invokeParsed("projects_list", undefined, (value, path) =>
      parseArray(value, path, parseResearchProject)
    ),
  projectGet: (id: number) =>
    invokeParsed("project_get", { id }, (value, path) =>
      parseNullable(value, path, parseResearchProject)
    ),
  projectCreate: (draft: ProjectDraft) =>
    invokeParsed("project_create", { draft }, parseResearchProject),
  projectUpdate: (id: number, draft: ProjectDraft) =>
    invoke<void>("project_update", { id, draft }),
  projectDelete: (id: number) => invoke<void>("project_delete", { id }),
  projectPapersList: (id: number) =>
    invokeParsed("project_papers_list", { id }, (value, path) =>
      parseArray(value, path, parsePaper)
    ),
  projectAddPaper: (id: number, paperId: string) =>
    invoke<void>("project_add_paper", { id, paperId }),
  projectRemovePaper: (id: number, paperId: string) =>
    invoke<void>("project_remove_paper", { id, paperId }),
  projectWeeklyReview: (id: number) =>
    invoke<ProjectWeeklyReview>("project_weekly_review", { id }),
  projectExportMarkdown: (id: number) =>
    invoke<string>("project_export_markdown", { id }),
  projectSourceManifest: (id: number) =>
    invoke<ProjectSourceManifest>("project_source_manifest", { id }),
  projectWritingOutline: (id: number) =>
    invoke<ProjectWritingOutline>("project_writing_outline", { id }),
  evidenceList: (projectId: number) =>
    invokeParsed("evidence_list", { projectId }, (value, path) =>
      parseArray(value, path, parseEvidenceItem)
    ),
  evidenceAdd: (projectId: number, draft: EvidenceDraft) =>
    invokeParsed("evidence_add", { projectId, draft }, parseEvidenceItem),
  evidenceAddFromHighlight: (projectId: number, highlightId: string) =>
    invokeParsed(
      "evidence_add_from_highlight",
      { projectId, highlightId },
      parseEvidenceItem
    ),
  evidenceDelete: (id: number) => invoke<void>("evidence_delete", { id }),
  evidenceExportMarkdown: (projectId: number) =>
    invoke<string>("evidence_export_markdown", { projectId }),
  generateLitReview: (paperIds: string[], grouping: string) =>
    invoke<LitReviewResult>("generate_lit_review", { paperIds, grouping }),
  smartCollectionsList: () =>
    invoke<SmartCollection[]>("smart_collections_list"),
  smartCollectionCreate: (name: string, rules: FilterRule) =>
    invoke<number>("smart_collection_create", { name, rules }),
  smartCollectionUpdate: (id: number, name: string, rules: FilterRule) =>
    invoke<void>("smart_collection_update", { id, name, rules }),
  smartCollectionDelete: (id: number) =>
    invoke<void>("smart_collection_delete", { id }),
  smartCollectionQueryPapers: (id: number) =>
    invokeParsed("smart_collection_query_papers", { id }, (value, path) =>
      parseArray(value, path, parsePaper)
    ),
  paperFindDuplicate: (paperId: string) =>
    invokeParsed("paper_find_duplicate", { paperId }, (value, path) =>
      parseNullable(value, path, parsePaper)
    ),
  paperScanDuplicates: () => invoke<DuplicatePair[]>("paper_scan_duplicates"),
  paperMerge: (keepId: string, mergeId: string) =>
    invoke<void>("paper_merge", { keepId, mergeId }),
  customFieldDefsList: () => invoke<CustomFieldDef[]>("custom_field_defs_list"),
  customFieldDefCreate: (name: string, fieldType: string, options?: string[]) =>
    invoke<number>("custom_field_def_create", {
      name,
      fieldType,
      options: options ?? null,
    }),
  customFieldDefDelete: (id: number) =>
    invoke<void>("custom_field_def_delete", { id }),
  paperCustomFieldsGet: (paperId: string) =>
    invoke<PaperCustomField[]>("paper_custom_fields_get", { paperId }),
  paperCustomFieldSet: (paperId: string, fieldId: number, value: string) =>
    invoke<void>("paper_custom_field_set", { paperId, fieldId, value }),
  paperCustomFieldDelete: (paperId: string, fieldId: number) =>
    invoke<void>("paper_custom_field_delete", { paperId, fieldId }),
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
  conceptsList: () => invoke<Concept[]>("concepts_list"),
  conceptCreate: (name: string, description?: string | null) =>
    invoke<number>("concept_create", {
      name,
      description: description ?? null,
    }),
  conceptDelete: (id: number) => invoke<void>("concept_delete", { id }),
  conceptRelationsList: () =>
    invoke<ConceptRelation[]>("concept_relations_list"),
  conceptRelationCreate: (
    sourceId: number,
    targetId: number,
    relation: string,
    evidencePaperId?: string | null,
    snippet?: string | null
  ) =>
    invoke<number>("concept_relation_create", {
      sourceId,
      targetId,
      relation,
      evidencePaperId: evidencePaperId ?? null,
      snippet: snippet ?? null,
    }),
  conceptRelationDelete: (id: number) =>
    invoke<void>("concept_relation_delete", { id }),
  conceptLinkPaper: (paperId: string, conceptId: number, relevance?: number) =>
    invoke<void>("concept_link_paper", {
      paperId,
      conceptId,
      relevance: relevance ?? 1.0,
    }),
  conceptUnlinkPaper: (paperId: string, conceptId: number) =>
    invoke<void>("concept_unlink_paper", { paperId, conceptId }),
  conceptForPaper: (paperId: string) =>
    invoke<PaperConcept[]>("concept_for_paper", { paperId }),
  conceptExtractFromPaper: (paperId: string) =>
    invoke<ExtractedConcept[]>("concept_extract_from_paper", { paperId }),
  conceptExtractAndStore: (paperId: string) =>
    invoke<number>("concept_extract_and_store", { paperId }),
};
