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
}

export interface Highlight {
  id: string;
  paper_id: string;
  page: number;
  rect: unknown;
  color: string;
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

export const api = {
  appVersion: () => invoke<string>("app_version"),
  libraryRoot: () => invoke<string>("library_root"),
  papersCount: () => invoke<number>("papers_count"),
  papersRecent: (limit?: number) => invoke<Paper[]>("papers_recent", { limit }),
  papersInFolder: (folderId: number, limit?: number) =>
    invoke<Paper[]>("papers_in_folder", { folderId, limit }),
  papersSearch: (query: string, limit?: number) =>
    invoke<Paper[]>("papers_search", { query, limit }),
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
  libraryAsk: (question: string, limit?: number) =>
    invoke<AskLibraryResult>("library_ask", { question, limit: limit ?? null }),
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
  highlightCreate: (paperId: string, page: number, rect: unknown, text: string, color?: string) =>
    invoke<Highlight>("highlight_create", { paperId, page, rect, text, color: color ?? null }),
  highlightList: (paperId: string) =>
    invoke<Highlight[]>("highlight_list", { paperId }),
  highlightUpdateNote: (id: string, note: string | null) =>
    invoke<void>("highlight_update_note", { id, note }),
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
};

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
