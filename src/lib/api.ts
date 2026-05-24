import { invoke } from "@tauri-apps/api/core";
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

export type ReadStatus = "unread" | "reading" | "read" | "must";

export interface ExpandedQuery {
  original: string;
  expanded: string;
  terms: string[];
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
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

export interface Highlight {
  id: string;
  paper_id: string;
  page: number;
  rect: unknown;
  color: string;
  text: string;
  note: string | null;
  created_at: number;
}

export const api = {
  appVersion: () => invoke<string>("app_version"),
  libraryRoot: () => invoke<string>("library_root"),
  papersCount: () => invoke<number>("papers_count"),
  papersRecent: (limit?: number) => invoke<Paper[]>("papers_recent", { limit }),
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
    recentLimit?: number;
    classicLimit?: number;
    recentWindowYears?: number;
  }) =>
    invoke<TopicReport>("topic_discover", {
      query: params.query,
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
  highlightDelete: (id: string) => invoke<void>("highlight_delete", { id }),
  noteGet: (paperId: string) => invoke<string>("note_get", { paperId }),
  noteSave: (paperId: string, content: string) =>
    invoke<void>("note_save", { paperId, content }),
  llmListModels: (profile: LlmProfile) =>
    invoke<string[]>("llm_list_models", { profile }),
  searchExpandQuery: (raw: string) =>
    invoke<ExpandedQuery>("search_expand_query", { raw }),
};

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
