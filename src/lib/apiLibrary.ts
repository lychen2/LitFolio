import { invoke } from "@tauri-apps/api/core";

import {
  parseArxivDraft,
  parseJobRecord,
  parsePaper,
  parsePaperSupplement,
  parsePdfImportSummary,
  parseStorageStats,
  parseSupplementConversionResult,
} from "./apiSchema";
import { parseArray, parseNullable } from "./apiSchemaCore";
import { invokeParsed } from "./apiInvoke";
import type {
  ArxivDraft,
  BulkAddSummary,
  Folder,
  JobDraft,
  JobStatus,
  FolderWithCount,
  Paper,
  ReadStatus,
  SearchHit,
  Tag,
  TagWithCount,
  TopicReport,
} from "./types/api";

export const libraryApi = {
  appVersion: () => invoke<string>("app_version"),
  libraryRoot: () => invoke<string>("library_root"),
  papersCount: () => invoke<number>("papers_count"),
  papersRecent: (limit?: number) =>
    invokeParsed("papers_recent", { limit }, (value, path) =>
      parseArray(value, path, parsePaper),
    ),
  papersInFolder: (folderId: number, limit?: number, query?: string) =>
    invokeParsed("papers_in_folder", { folderId, limit, query }, (value, path) =>
      parseArray(value, path, parsePaper),
    ),
  papersSearch: (query: string, limit?: number) =>
    invokeParsed("papers_search", { query, limit }, (value, path) =>
      parseArray(value, path, parsePaper),
    ),
  papersAllArxivIds: () => invoke<string[]>("papers_all_arxiv_ids"),
  paperGet: (id: string) =>
    invokeParsed("paper_get", { id }, (value, path) => parseNullable(value, path, parsePaper)),
  paperSetReadStatus: (id: string, status: ReadStatus) =>
    invoke<void>("paper_set_read_status", { id, status }),
  paperDelete: (id: string) => invoke<void>("paper_delete", { id }),
  paperEnrichFromDoi: (id: string, doi: string) =>
    invokeParsed("paper_enrich_from_doi", { id, doi }, parsePaper),
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
  paperTags: (paperId: string) => invoke<Tag[]>("paper_tags", { paperId }),
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
  paperFolders: (paperId: string) => invoke<Folder[]>("paper_folders", { paperId }),
  importDoi: (doi: string) => invokeParsed("import_doi", { doi }, parsePaper),
  importArxiv: (arxivId: string) => invokeParsed("import_arxiv", { arxivId }, parsePaper),
  importBibtex: (text: string) =>
    invokeParsed("import_bibtex", { text }, (value, path) =>
      parseArray(value, path, parsePaper),
    ),
  importPdfFiles: (paths: string[]) =>
    invokeParsed("import_pdf_files", { paths }, parsePdfImportSummary),
  jobsList: (status?: JobStatus | null, limit?: number) =>
    invokeParsed("jobs_list", { status: status ?? null, limit }, (value, path) =>
      parseArray(value, path, parseJobRecord),
    ),
  jobCreate: (draft: JobDraft) =>
    invokeParsed("job_create", { draft }, parseJobRecord),
  jobStart: (id: string) => invokeParsed("job_start", { id }, parseJobRecord),
  jobUpdateProgress: (id: string, current: number, total: number) =>
    invokeParsed(
      "job_update_progress",
      { id, current, total },
      parseJobRecord,
    ),
  jobSucceed: (id: string) =>
    invokeParsed("job_succeed", { id }, parseJobRecord),
  jobFail: (id: string, error: string) =>
    invokeParsed("job_fail", { id, error }, parseJobRecord),
  jobCancel: (id: string) =>
    invokeParsed("job_cancel", { id }, parseJobRecord),
  jobRetry: (id: string) =>
    invokeParsed("job_retry", { id }, parseJobRecord),
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
    invokeParsed("arxiv_list_category", { category, maxResults, start }, (value, path) =>
      parseArray(value, path, parseArxivDraft),
    ),
  arxivAddDraft: (draft: ArxivDraft) =>
    invokeParsed("arxiv_add_draft", { draft }, parsePaper),
  arxivAddWithPdf: (arxivId: string) =>
    invokeParsed("arxiv_add_with_pdf", { arxivId }, parsePaper),
  doiAddWithPdf: (doi: string) =>
    invokeParsed("doi_add_with_pdf", { doi }, parsePaper),
  prepareDoiDraft: (doi: string) =>
    invokeParsed("prepare_doi_draft", { doi }, parseArxivDraft),
  paperFindByDoi: (doi: string) =>
    invokeParsed("paper_find_by_doi", { doi }, (value, path) =>
      parseNullable(value, path, parsePaper),
    ),
  prepareArxivDraft: (arxivId: string) =>
    invokeParsed("prepare_arxiv_draft", { arxivId }, parseArxivDraft),
  paperSaveWithPdf: (draft: ArxivDraft, sourcePdfPath: string) =>
    invokeParsed("paper_save_with_pdf", { draft, sourcePdfPath }, parsePaper),
  paperAttachPdf: (id: string, sourcePdfPath: string) =>
    invokeParsed("paper_attach_pdf", { id, sourcePdfPath }, parsePaper),
  paperOpenPdf: (id: string) => invoke<void>("paper_open_pdf", { id }),
  paperPdfAssetPath: (id: string) => invoke<string>("paper_pdf_asset_path", { id }),
  paperSupplementsList: (paperId: string) =>
    invokeParsed("paper_supplements_list", { paperId }, (value, path) =>
      parseArray(value, path, parsePaperSupplement),
    ),
  paperSupplementAddFile: (paperId: string, sourcePath: string) =>
    invokeParsed("paper_supplement_add_file", { paperId, sourcePath }, parsePaperSupplement),
  paperSupplementUpdateNote: (id: number, note: string) =>
    invokeParsed("paper_supplement_update_note", { id, note }, parsePaperSupplement),
  paperSupplementDelete: (id: number) => invoke<void>("paper_supplement_delete", { id }),
  paperSupplementOpen: (id: number, preferPdf?: boolean) =>
    invoke<void>("paper_supplement_open", { id, preferPdf: preferPdf ?? null }),
  paperSupplementConvertDocxToPdf: (id: number) =>
    invokeParsed("paper_supplement_convert_docx_to_pdf", { id }, parseSupplementConversionResult),
  storageStats: () =>
    invokeParsed("storage_stats", {}, parseStorageStats),
};
