import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { open as openInSystem } from "@tauri-apps/plugin-shell";

export interface Paper {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  doi: string | null;
  arxiv_id: string | null;
  abstract_text: string | null;
  pdf_path: string | null;
  note_path: string | null;
  added_at: number;
  updated_at: number;
  read_status: "unread" | "reading" | "read" | "must";
  tldr: string | null;
  research_question: string | null;
  method: string | null;
  dataset: string | null;
  key_findings: string[];
  limitations: string | null;
  comparison: string | null;
  title_translated: string | null;
  abstract_translated: string | null;
  translate_target_lang: string | null;
  translated_at: number | null;
  bibtex: string | null;
}

export interface PdfImportSummary {
  imported: Paper[];
  failed: { path: string; error: string }[];
}

export interface SearchHit {
  paper_id: string | null;
  citation_count: number | null;
  influential_citation_count: number | null;
  draft: {
    title: string;
    authors: string[];
    year: number | null;
    venue: string | null;
    doi: string | null;
    arxiv_id: string | null;
    abstract_text: string | null;
  };
}

export interface TopicReport {
  query: string;
  recent_year_from: number;
  recent_year_to: number;
  recent: SearchHit[];
  classic: SearchHit[];
}

export interface BulkAddSummary {
  imported: Paper[];
  skipped: string[];
}

export interface LlmProfile {
  name: string;
  base_url: string;
  api_key: string;
  chat_model: string;
  embed_model: string | null;
  max_tokens: number;
  temperature: number;
}

export interface LlmConfig {
  profiles: LlmProfile[];
  active: string | null;
  task_assignments: TaskAssignments;
  output_language: string;
}

export interface TranslationResult {
  title: string;
  abstract_text: string;
  target_lang: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
}

export interface BatchError {
  paper_id: string;
  title: string;
  message: string;
}

export interface BatchSummary {
  kind: string;
  total: number;
  ok: number;
  failed: number;
  cancelled: boolean;
  errors: BatchError[];
}

export interface ExportSummary {
  exported: number;
  skipped: number;
  errors: string[];
}

export interface UnifiedSearchResult {
  source: "paper" | "highlight" | "term";
  paper_id: string;
  paper_title: string;
  snippet: string;
  score: number;
}

export interface PaperComparison {
  id: number;
  paper_ids: string[];
  content: string;
  model: string;
  created_at: number;
  updated_at: number;
}

export interface NoteSection {
  id: number;
  paper_id: string;
  section_key: string;
  content: string;
  source: string;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export interface Recommendation {
  paper_id: string;
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  abstract_snippet: string | null;
  doi: string | null;
  arxiv_id: string | null;
  citation_count: number | null;
}

export interface CitationPaper {
  paper_id: string;
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  abstract_snippet: string | null;
  doi: string | null;
  arxiv_id: string | null;
}

export interface CitationGraph {
  paper_id: string;
  references: CitationPaper[];
  citations: CitationPaper[];
}

export interface QueueEntry {
  paper_id: string;
  priority: number;
  target_date: number | null;
  note: string | null;
  added_at: number;
  title: string | null;
  authors: string | null;
  year: number | null;
}

export interface TaskBinding {
  profile: string;
  model: string | null;
}

export interface TaskAssignments {
  tldr: TaskBinding | null;
  quick_read: TaskBinding | null;
  translate: TaskBinding | null;
  tag: TaskBinding | null;
  link: TaskBinding | null;
  topic_survey: TaskBinding | null;
  ask: TaskBinding | null;
}

export interface LlmTestResult {
  ok: boolean;
  model: string;
  reply: string;
}

export interface TldrResult {
  tldr: string;
  key_findings: string[];
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
}

export interface QuickReadResult {
  problem: string;
  method: string;
  comparison: string;
  limitations: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
}

export interface Tag {
  id: number;
  name: string;
  parent_id: number | null;
  color: string | null;
}

export interface TagWithCount extends Tag {
  paper_count: number;
}

export interface Folder {
  id: number;
  name: string;
  parent_id: number | null;
}

export interface FolderWithCount extends Folder {
  paper_count: number;
}

export type ReadStatus = "unread" | "reading" | "read" | "must";

export interface ExpandedQuery {
  original: string;
  expanded: string;
  terms: string[];
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
}

// ─── Topic Survey (§4) ─────────────────────────────────────────────────────

export interface SurveyPaper {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  doi: string | null;
  arxiv_id: string | null;
  abstract_text: string | null;
  citation_count: number | null;
  influential_citation_count: number | null;
  why_important: string | null;
  must_read: boolean;
}

export interface SurveySubareaResult {
  name: string;
  year_range: [number, number] | null;
  summary: string;
  search_terms: string[];
  papers: SurveyPaper[];
}

export interface SurveyKeyPi {
  name: string;
  why_central: string;
}

export interface TopicSurvey {
  topic: string;
  subareas: SurveySubareaResult[];
  key_pis: SurveyKeyPi[];
  must_read_ids: string[];
  annotated: boolean;
  plan_model: string;
  plan_tokens: number;
  annotate_model: string | null;
  annotate_tokens: number;
}

export type TopicSurveyPhase = "planning" | "grounding" | "annotating" | "done";
export interface TopicSurveyProgress {
  phase: TopicSurveyPhase;
  subarea_total?: number;
}

export interface ArxivDraft {
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  doi: string | null;
  arxiv_id: string | null;
  abstract_text: string | null;
}

export interface AskSource {
  paper_id: string;
  title: string;
  year: number | null;
  authors: string[];
  snippet: string;
}

export interface AskLibraryResult {
  answer: string;
  sources: AskSource[];
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  /** LLM-rewritten search terms (or [raw question] if rewrite was skipped/failed). */
  terms: string[];
  /** Distinct papers actually fed to the LLM as sources. */
  retrieved_count: number;
}

export interface SaveAskNoteInput {
  question: string;
  answer: string;
  terms: string[];
  sources: AskSource[];
  model: string;
}

export interface SaveAskNoteResult {
  path: string;
}

export interface LinkedPaper {
  paper_id: string;
  title: string;
  year: number | null;
  relation: string;
  snippet: string;
}

export interface TermInsight {
  term: string;
  local_definition: string;
  local_evidence: string;
  linked_papers: LinkedPaper[];
}

export interface ReaderTranslateResult {
  translation: string;
  terms: TermInsight[];
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
}

export interface PaperTerm {
  id: number;
  paper_id: string;
  term: string;
  normalized_term: string;
  local_definition: string;
  local_evidence: string;
  score: number;
  created_at: number;
  updated_at: number;
}

export interface RelatedPaperTerm {
  paper_id: string;
  paper_title: string;
  paper_year: number | null;
  term: string;
  local_definition: string;
}

export interface ReaderPaperTerm {
  term: PaperTerm;
  related: RelatedPaperTerm[];
  definition_status: "pending" | "ready";
}

export interface Highlight {
  id: string;
  paper_id: string;
  page: number;
  rect: unknown;
  color: string;
  label: string | null;
  text: string;
  note: string | null;
  summary_text: string | null;
  summary_model: string | null;
  summarized_at: number | null;
  translation_text: string | null;
  translation_target_lang: string | null;
  translation_model: string | null;
  translated_at: number | null;
  created_at: number;
}

// ─── Knowledge Graph ──────────────────────────────────────────────────────

export interface PaperLink {
  id: number;
  source_paper_id: string;
  target_paper_id: string;
  relation: string;
  source_type: "user" | "ai";
  confidence: number;
  snippet: string | null;
  created_at: number;
  updated_at: number;
}

export interface GraphNode {
  id: string;
  node_type: "paper" | "concept";
  label: string;
  sublabel: string | null;
  year?: number;
  read_status?: string;
  paper_count?: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  edge_type: string;
  source_type: "user" | "ai" | "derived";
  confidence: number;
  snippet: string | null;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphFilter {
  relations?: string[];
  min_confidence?: number;
  include_concepts?: boolean;
  paper_ids?: string[];
}

export interface LinkBatchSummary {
  total: number;
  created: number;
  skipped: number;
}

export const api = {
  appVersion: () => invoke<string>("app_version"),
  libraryRoot: () => invoke<string>("library_root"),
  papersCount: () => invoke<number>("papers_count"),
  papersRecent: (limit?: number) => invoke<Paper[]>("papers_recent", { limit }),
  papersInFolder: (folderId: number, limit?: number) =>
    invoke<Paper[]>("papers_in_folder", { folderId, limit }),
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
  libraryAsk: (question: string, limit?: number, conversationHistory?: { role: string; content: string }[]) =>
    invoke<AskLibraryResult>("library_ask", { question, limit: limit ?? null, conversationHistory: conversationHistory ?? null }),
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

export interface FolderImportProgress {
  phase: string;
  done: number;
  total: number;
  current_file: string;
  failed: number;
}

export interface CustomFieldDef {
  id: number;
  name: string;
  field_type: string;
  options: string[] | null;
  created_at: number;
}

export interface PaperCustomField {
  field_id: number;
  field_name: string;
  field_type: string;
  options: string[] | null;
  value: string;
}

export interface DuplicatePair {
  paper_a: Paper;
  paper_b: Paper;
  reason: string;
}

export interface FilterRuleCondition {
  type: "condition";
  field: string;
  operator: string;
  value: string | number;
}

export interface FilterRuleGroup {
  type: "group";
  combinator: "and" | "or";
  rules: FilterRule[];
}

export type FilterRule = FilterRuleCondition | FilterRuleGroup;

export interface SmartCollection {
  id: number;
  name: string;
  rules: FilterRule;
  created_at: number;
  updated_at: number;
}

export interface LitReviewResult {
  markdown: string;
  grouping: string;
  paper_count: number;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
}

export interface TopicAlert {
  id: number;
  query: string;
  frequency: string;
  target_folder_id: number | null;
  auto_import: boolean;
  last_run_at: number | null;
  created_at: number;
}

export interface TopicAlertResult {
  id: number;
  alert_id: number;
  paper_doi: string | null;
  paper_arxiv_id: string | null;
  title: string;
  authors: string | null;
  year: number | null;
  abstract_text: string | null;
  seen: boolean;
  added_at: number;
}

export interface Concept {
  id: number;
  name: string;
  description: string | null;
  source: string;
  created_at: number;
}

export interface ConceptRelation {
  id: number;
  source_concept_id: number;
  target_concept_id: number;
  relation: string;
  evidence_paper_id: string | null;
  snippet: string | null;
  created_at: number;
}

export interface PaperConcept {
  paper_id: string;
  concept_id: number;
  concept_name: string;
  relevance: number;
}

export interface ExtractedConcept {
  name: string;
  description: string;
  relations: ExtractedRelation[];
}

export interface ExtractedRelation {
  target: string;
  relation: string;
  snippet: string | null;
}

export interface Feed {
  id: number;
  url: string;
  title: string;
  description: string | null;
  etag: string | null;
  last_modified: string | null;
  last_fetched_at: number | null;
  last_error: string | null;
  created_at: number;
}

export interface FeedWithCounts extends Feed {
  total_items: number;
  unread_items: number;
}

export interface FeedItem {
  id: string;
  feed_id: number;
  entry_id: string;
  title: string;
  link: string | null;
  summary: string | null;
  authors: string[];
  published_at: number | null;
  fetched_at: number;
  seen: boolean;
  imported_paper_id: string | null;
}

export interface FeedRefreshResult {
  new_items: number;
  not_modified: boolean;
}

export interface FeedRefreshAllSummary {
  refreshed: number;
  unchanged: number;
  failed: number;
  new_items: number;
  errors: string[];
}

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

export async function openPdfInSystem(path: string): Promise<void> {
  await openInSystem(path);
}
