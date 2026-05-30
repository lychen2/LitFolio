import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import type { Paper, PdfImportSummary, SearchHit, TopicReport, BulkAddSummary, LlmProfile, LlmConfig, TranslationResult, BatchSummary, ExportSummary, UnifiedSearchResult, PaperComparison, NoteSection, Recommendation, CitationGraph, QueueEntry, LlmTestResult, TldrResult, QuickReadResult, Tag, TagWithCount, Folder, FolderWithCount, ReadStatus, ExpandedQuery, TopicSurvey, TopicSurveyProgress, ArxivDraft, AskLibraryResult, SaveAskNoteInput, SaveAskNoteResult, ReaderTranslateResult, ReaderPaperTerm, Highlight, PaperLink, GraphData, GraphFilter, LinkBatchSummary, CustomFieldDef, PaperCustomField, DuplicatePair, FilterRule, SmartCollection, LitReviewResult, TopicAlert, TopicAlertResult, Concept, ConceptRelation, PaperConcept, ExtractedConcept, FeedWithCounts, FeedItem, FeedRefreshResult, FeedRefreshAllSummary } from "./types/api";

export type { Paper, PdfImportSummary, SearchHit, TopicReport, BulkAddSummary, LlmProfile, LlmConfig, TranslationResult, BatchError, BatchSummary, ExportSummary, UnifiedSearchResult, PaperComparison, NoteSection, Recommendation, CitationPaper, CitationGraph, QueueEntry, TaskBinding, TaskAssignments, LlmTestResult, TldrResult, QuickReadResult, Tag, TagWithCount, Folder, FolderWithCount, ReadStatus, ExpandedQuery, SurveyPaper, SurveySubareaResult, SurveyKeyPi, TopicSurvey, TopicSurveyPhase, TopicSurveyProgress, ArxivDraft, AskSource, AskLibraryResult, SaveAskNoteInput, SaveAskNoteResult, LinkedPaper, TermInsight, ReaderTranslateResult, PaperTerm, RelatedPaperTerm, ReaderPaperTerm, Highlight, PaperLink, GraphNode, GraphEdge, GraphData, GraphFilter, LinkBatchSummary, FolderImportProgress, CustomFieldDef, PaperCustomField, DuplicatePair, FilterRuleCondition, FilterRuleGroup, FilterRule, SmartCollection, LitReviewResult, TopicAlert, TopicAlertResult, Concept, ConceptRelation, PaperConcept, ExtractedConcept, ExtractedRelation, Feed, FeedWithCounts, FeedItem, FeedRefreshResult, FeedRefreshAllSummary } from "./types/api";

export const api = {
  appVersion: () => invoke<string>("app_version"),
  libraryRoot: () => invoke<string>("library_root"),
  papersCount: () => invoke<number>("papers_count"),
  papersRecent: (limit?: number) => invoke<Paper[]>("papers_recent", { limit }),
  papersInFolder: (folderId: number, limit?: number, query?: string) =>
    invoke<Paper[]>("papers_in_folder", { folderId, limit, query }),
  papersSearch: (query: string, limit?: number) =>
    invoke<Paper[]>("papers_search", { query, limit }),
  papersAllArxivIds: () => invoke<string[]>("papers_all_arxiv_ids"),
  paperGet: (id: string) => invoke<Paper | null>("paper_get", { id }),
  paperSetReadStatus: (id: string, status: ReadStatus) =>
    invoke<void>("paper_set_read_status", { id, status }),
  paperDelete: (id: string) => invoke<void>("paper_delete", { id }),
  tagsList: () => invoke<TagWithCount[]>("tags_list"),
  tagCreate: (name: string, color?: string | null) =>
    invoke<Tag>("tag_create", { name, color: color ?? null }),
  tagRename: (id: number, newName: string) =>
    invoke<void>("tag_rename", { id, newName }),
  tagSetColor: (id: number, color: string | null) =>
    invoke<void>("tag_set_color", { id, color }),
  tagDelete: (id: number) => invoke<void>("tag_delete", { id }),
  paperAttachTag: (paperId: string, tagId: number) =>
    invoke<void>("paper_attach_tag", { paperId, tagId }),
  paperDetachTag: (paperId: string, tagId: number) =>
    invoke<void>("paper_detach_tag", { paperId, tagId }),
  paperTags: (paperId: string) =>
    invoke<Tag[]>("paper_tags", { paperId }),
  papersBatchTags: (paperIds: string[]) =>
    invoke<Record<string, Tag[]>>("papers_batch_tags", { paperIds }),
  foldersList: () => invoke<FolderWithCount[]>("folders_list"),
  folderCreate: (name: string, parentId?: number | null) =>
    invoke<Folder>("folder_create", { name, parentId: parentId ?? null }),
  folderRename: (id: number, name: string) =>
    invoke<void>("folder_rename", { id, name }),
  folderDelete: (id: number) => invoke<void>("folder_delete", { id }),
  paperAttachFolder: (paperId: string, folderId: number) =>
    invoke<void>("paper_attach_folder", { paperId, folderId }),
  paperDetachFolder: (paperId: string, folderId: number) =>
    invoke<void>("paper_detach_folder", { paperId, folderId }),
  paperFolders: (paperId: string) =>
    invoke<Folder[]>("paper_folders", { paperId }),
  importDoi: (doi: string) => invoke<Paper>("import_doi", { doi }),
  importArxiv: (arxivId: string) => invoke<Paper>("import_arxiv", { arxivId }),
  importBibtex: (text: string) => invoke<Paper[]>("import_bibtex", { text }),
  importPdfFiles: (paths: string[]) =>
    invoke<PdfImportSummary>("import_pdf_files", { paths }),
  searchPapers: (query: string, limit?: number) =>
    invoke<SearchHit[]>("search_papers", { query, limit }),
  addFromSearch: (result: SearchHit) =>
    invoke<Paper>("add_from_search", { result }),
  addManyFromSearch: (results: SearchHit[]) =>
    invoke<BulkAddSummary>("add_many_from_search", { results }),
  topicDiscover: (params: {
    query: string;
    terms?: string[];
    recentLimit?: number;
    classicLimit?: number;
    recentWindowYears?: number;
  }) =>
    invoke<TopicReport>("topic_discover", {
      query: params.query,
      terms: params.terms ?? null,
      recentLimit: params.recentLimit,
      classicLimit: params.classicLimit,
      recentWindowYears: params.recentWindowYears,
    }),
  arxivListCategory: (category: string, maxResults?: number, start?: number) =>
    invoke<ArxivDraft[]>("arxiv_list_category", { category, maxResults, start }),
  arxivAddDraft: (draft: ArxivDraft) =>
    invoke<Paper>("arxiv_add_draft", { draft }),
  arxivAddWithPdf: (arxivId: string) =>
    invoke<Paper>("arxiv_add_with_pdf", { arxivId }),
  prepareDoiDraft: (doi: string) => invoke<ArxivDraft>("prepare_doi_draft", { doi }),
  paperFindByDoi: (doi: string) => invoke<Paper | null>("paper_find_by_doi", { doi }),
  prepareArxivDraft: (arxivId: string) => invoke<ArxivDraft>("prepare_arxiv_draft", { arxivId }),
  paperSaveWithPdf: (draft: ArxivDraft, sourcePdfPath: string) =>
    invoke<Paper>("paper_save_with_pdf", { draft, sourcePdfPath }),
  paperAttachPdf: (id: string, sourcePdfPath: string) =>
    invoke<Paper>("paper_attach_pdf", { id, sourcePdfPath }),
  paperOpenPdf: (id: string) => invoke<void>("paper_open_pdf", { id }),
  paperReadPdfBytes: (id: string) =>
    invoke<number[]>("paper_read_pdf_bytes", { id }),
  llmGetConfig: () => invoke<LlmConfig>("llm_get_config"),
  llmSaveConfig: (config: LlmConfig) =>
    invoke<void>("llm_save_config", { config }),
  llmTest: (profile: LlmProfile) =>
    invoke<LlmTestResult>("llm_test", { profile }),
  paperTldr: (id: string) => invoke<TldrResult>("paper_tldr", { id }),
  paperQuickRead: (id: string) =>
    invoke<QuickReadResult>("paper_quick_read", { id }),
  paperTranslate: (id: string, targetLang?: string) =>
    invoke<TranslationResult>("paper_translate", { id, targetLang: targetLang ?? "Chinese" }),
  draftTranslate: (draft: ArxivDraft, targetLang?: string) =>
    invoke<TranslationResult>("draft_translate", { draft, targetLang: targetLang ?? "Chinese" }),
  libraryAsk: (question: string, limit?: number, conversationHistory?: { role: string; content: string }[], pinnedPaperIds?: string[]) =>
    invoke<AskLibraryResult>("library_ask", { question, limit: limit ?? null, conversationHistory: conversationHistory ?? null, pinnedPaperIds: pinnedPaperIds && pinnedPaperIds.length > 0 ? pinnedPaperIds : null }),
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
  highlightCreate: (paperId: string, page: number, rect: unknown, text: string, color?: string, label?: string) =>
    invoke<Highlight>("highlight_create", { paperId, page, rect, text, color: color ?? null, label: label ?? null }),
  highlightList: (paperId: string) =>
    invoke<Highlight[]>("highlight_list", { paperId }),
  highlightUpdateNote: (id: string, note: string | null) =>
    invoke<void>("highlight_update_note", { id, note }),
  highlightUpdateLabel: (id: string, label: string | null) =>
    invoke<void>("highlight_update_label", { id, label }),
  highlightSummarize: (id: string) =>
    invoke<Highlight>("highlight_summarize", { highlightId: id }),
  highlightTranslate: (id: string, targetLang?: string) =>
    invoke<Highlight>("highlight_translate", { highlightId: id, targetLang: targetLang ?? "Chinese" }),
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
  topicSurvey: (params: {
    topic: string;
    annotate?: boolean;
    perSubareaTopk?: number;
  }) =>
    invoke<TopicSurvey>("topic_survey", {
      topic: params.topic,
      annotate: params.annotate ?? null,
      perSubareaTopk: params.perSubareaTopk ?? null,
    }),
  feedsList: () => invoke<FeedWithCounts[]>("feeds_list"),
  feedAdd: (url: string) => invoke<FeedWithCounts>("feed_add", { url }),
  feedRemove: (id: number) => invoke<void>("feed_remove", { id }),
  feedRefresh: (id: number) => invoke<FeedRefreshResult>("feed_refresh", { id }),
  feedRefreshAll: () => invoke<FeedRefreshAllSummary>("feed_refresh_all"),
  feedItemsList: (params: {
    feedId?: number | null;
    onlyUnread?: boolean;
    limit?: number;
    offset?: number;
  }) =>
    invoke<FeedItem[]>("feed_items_list", {
      feedId: params.feedId ?? null,
      onlyUnread: params.onlyUnread ?? null,
      limit: params.limit ?? null,
      offset: params.offset ?? null,
    }),
  feedItemSetSeen: (itemId: string, seen: boolean) =>
    invoke<void>("feed_item_set_seen", { itemId, seen }),
  feedMarkAllSeen: (feedId: number) =>
    invoke<void>("feed_mark_all_seen", { feedId }),
  feedItemLinkPaper: (itemId: string, paperId: string) =>
    invoke<void>("feed_item_link_paper", { itemId, paperId }),
  feedItemPrepareDraft: (itemId: string) =>
    invoke<ArxivDraft>("feed_item_prepare_draft", { itemId }),
  // ─── Knowledge Graph ────────────────────────────────────────────────
  graphData: (filter?: GraphFilter) =>
    invoke<GraphData>("graph_data", { filter: filter ?? {} }),
  paperLinkCreate: (
    sourcePaperId: string,
    targetPaperId: string,
    relation: string,
    snippet?: string | null,
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
    snippet?: string | null,
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
  exportMarkdownSetDir: (dir: string) => invoke<void>("export_markdown_set_dir", { dir }),
  exportMarkdownAll: (incremental?: boolean) =>
    invoke<ExportSummary>("export_markdown_all", { incremental: incremental ?? true }),
  exportMarkdownPaper: (paperId: string) =>
    invoke<string>("export_markdown_paper", { paperId }),
  searchUnified: (query: string, limit?: number) =>
    invoke<UnifiedSearchResult[]>("search_unified", { query, limit: limit ?? 50 }),
  paperComparisonsList: () => invoke<PaperComparison[]>("paper_comparisons_list"),
  paperComparisonGet: (id: number) => invoke<PaperComparison | null>("paper_comparison_get", { id }),
  paperComparisonCreate: (paperIds: string[], content: string, model: string) =>
    invoke<number>("paper_comparison_create", { paperIds, content, model }),
  paperComparisonUpdate: (id: number, content: string) =>
    invoke<void>("paper_comparison_update", { id, content }),
  paperComparisonDelete: (id: number) => invoke<void>("paper_comparison_delete", { id }),
  noteSectionsGet: (paperId: string) =>
    invoke<NoteSection[]>("note_sections_get", { paperId }),
  noteSectionsSave: (paperId: string, sectionKey: string, content: string, source?: string) =>
    invoke<void>("note_sections_save", { paperId, sectionKey, content, source: source ?? "user" }),
  noteSectionsReorder: (paperId: string, sectionIds: number[]) =>
    invoke<void>("note_sections_reorder", { paperId, sectionIds }),
  noteSectionDelete: (id: number) => invoke<void>("note_section_delete", { id }),
  paperSimilar: (id: string) => invoke<Recommendation[]>("paper_similar", { id }),
  exportCitations: (paperIds: string[], format: string) =>
    invoke<string>("export_citations", { request: { paper_ids: paperIds, format } }),
  paperCitations: (id: string) => invoke<CitationGraph>("paper_citations", { id }),
  queueList: () => invoke<QueueEntry[]>("queue_list"),
  queueAdd: (paperId: string, priority?: number, targetDate?: number, note?: string) =>
    invoke<void>("queue_add", { paperId, priority: priority ?? 0, targetDate: targetDate ?? null, note: note ?? null }),
  queueRemove: (paperId: string) => invoke<void>("queue_remove", { paperId }),
  queueUpdate: (paperId: string, priority: number, targetDate?: number, note?: string) =>
    invoke<void>("queue_update", { paperId, priority, targetDate: targetDate ?? null, note: note ?? null }),
  queueReorder: (paperIds: string[]) => invoke<void>("queue_reorder", { paperIds }),
  generateLitReview: (paperIds: string[], grouping: string) =>
    invoke<LitReviewResult>("generate_lit_review", { paperIds, grouping }),
  smartCollectionsList: () => invoke<SmartCollection[]>("smart_collections_list"),
  smartCollectionCreate: (name: string, rules: FilterRule) =>
    invoke<number>("smart_collection_create", { name, rules }),
  smartCollectionUpdate: (id: number, name: string, rules: FilterRule) =>
    invoke<void>("smart_collection_update", { id, name, rules }),
  smartCollectionDelete: (id: number) =>
    invoke<void>("smart_collection_delete", { id }),
  smartCollectionQueryPapers: (id: number) =>
    invoke<Paper[]>("smart_collection_query_papers", { id }),
  paperFindDuplicate: (paperId: string) =>
    invoke<Paper | null>("paper_find_duplicate", { paperId }),
  paperScanDuplicates: () =>
    invoke<DuplicatePair[]>("paper_scan_duplicates"),
  paperMerge: (keepId: string, mergeId: string) =>
    invoke<void>("paper_merge", { keepId, mergeId }),
  customFieldDefsList: () => invoke<CustomFieldDef[]>("custom_field_defs_list"),
  customFieldDefCreate: (name: string, fieldType: string, options?: string[]) =>
    invoke<number>("custom_field_def_create", { name, fieldType, options: options ?? null }),
  customFieldDefDelete: (id: number) => invoke<void>("custom_field_def_delete", { id }),
  paperCustomFieldsGet: (paperId: string) =>
    invoke<PaperCustomField[]>("paper_custom_fields_get", { paperId }),
  paperCustomFieldSet: (paperId: string, fieldId: number, value: string) =>
    invoke<void>("paper_custom_field_set", { paperId, fieldId, value }),
  paperCustomFieldDelete: (paperId: string, fieldId: number) =>
    invoke<void>("paper_custom_field_delete", { paperId, fieldId }),
  importFolder: (dirPath: string) =>
    invoke<PdfImportSummary>("import_folder", { dirPath }),
  topicAlertsList: () => invoke<TopicAlert[]>("topic_alerts_list"),
  topicAlertCreate: (query: string, frequency: string, targetFolderId?: number | null, autoImport?: boolean) =>
    invoke<number>("topic_alert_create", { query, frequency, targetFolderId: targetFolderId ?? null, autoImport: autoImport ?? false }),
  topicAlertDelete: (id: number) => invoke<void>("topic_alert_delete", { id }),
  topicAlertResultsList: (alertId: number, unseenOnly?: boolean) =>
    invoke<TopicAlertResult[]>("topic_alert_results_list", { alertId, unseenOnly: unseenOnly ?? false }),
  topicAlertResultMarkSeen: (resultId: number) =>
    invoke<void>("topic_alert_result_mark_seen", { resultId }),
  topicAlertMarkAllSeen: (alertId: number) =>
    invoke<void>("topic_alert_mark_all_seen", { alertId }),
  topicAlertUnseenCount: () => invoke<number>("topic_alert_unseen_count"),
  topicAlertRun: (alertId: number) => invoke<number>("topic_alert_run", { alertId }),
  topicAlertRunAll: () => invoke<number>("topic_alert_run_all"),
  // ─── Concepts ──────────────────────────────────────────────────
  conceptsList: () => invoke<Concept[]>("concepts_list"),
  conceptCreate: (name: string, description?: string | null) =>
    invoke<number>("concept_create", { name, description: description ?? null }),
  conceptDelete: (id: number) => invoke<void>("concept_delete", { id }),
  conceptRelationsList: () => invoke<ConceptRelation[]>("concept_relations_list"),
  conceptRelationCreate: (
    sourceId: number,
    targetId: number,
    relation: string,
    evidencePaperId?: string | null,
    snippet?: string | null,
  ) =>
    invoke<number>("concept_relation_create", {
      sourceId,
      targetId,
      relation,
      evidencePaperId: evidencePaperId ?? null,
      snippet: snippet ?? null,
    }),
  conceptRelationDelete: (id: number) => invoke<void>("concept_relation_delete", { id }),
  conceptLinkPaper: (paperId: string, conceptId: number, relevance?: number) =>
    invoke<void>("concept_link_paper", { paperId, conceptId, relevance: relevance ?? 1.0 }),
  conceptUnlinkPaper: (paperId: string, conceptId: number) =>
    invoke<void>("concept_unlink_paper", { paperId, conceptId }),
  conceptForPaper: (paperId: string) =>
    invoke<PaperConcept[]>("concept_for_paper", { paperId }),
  conceptExtractFromPaper: (paperId: string) =>
    invoke<ExtractedConcept[]>("concept_extract_from_paper", { paperId }),
  conceptExtractAndStore: (paperId: string) =>
    invoke<number>("concept_extract_and_store", { paperId }),
};

/// Subscribe to backend progress events for an in-flight `topic_survey` call.
/// Returns the unlisten function — callers MUST call it on unmount or the
/// listener leaks across page navigations.
export async function subscribeTopicSurveyProgress(
  cb: (p: TopicSurveyProgress) => void,
): Promise<UnlistenFn> {
  return listen<TopicSurveyProgress>("topic-survey-progress", (e) => cb(e.payload));
}

export async function pickPdfFiles(): Promise<string[] | null> {
  const selection = await open({
    multiple: true,
    directory: false,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (!selection) return null;
  return Array.isArray(selection) ? selection : [selection];
}

export async function pickSinglePdf(): Promise<string | null> {
  const sel = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (!sel) return null;
  return Array.isArray(sel) ? sel[0] : sel;
}
