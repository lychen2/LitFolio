import { invoke } from "@tauri-apps/api/core";

import type {
  PdfTextNoteCreateInput,
  PdfTextNotePatch,
  PdfTextNoteSearchResult,
} from "@/core/contracts";
import { aiReaderApi } from "@/lib/apiAiReader";
import { invokeParsed } from "@/lib/apiInvoke";
import { knowledgeApi } from "@/lib/apiKnowledge";
import {
  parseLegacyReaderNotesPreview,
  parseLegacyReaderNotesReport,
  parsePdfTextNote,
  parsePdfTextNoteSearchResult,
  type LegacyReaderNotesPreview,
  type LegacyReaderNotesReport,
} from "@/lib/apiSchemaReader";
import { parseArray } from "@/lib/apiSchemaCore";

/**
 * Reader document and annotation operations exposed through the core boundary.
 * `mono-reader-annotations` removes delegation after it owns these operations.
 */
export const readerClient = {
  highlightCreate: aiReaderApi.highlightCreate,
  highlightList: aiReaderApi.highlightList,
  highlightUpdateNote: aiReaderApi.highlightUpdateNote,
  highlightUpdateRect: aiReaderApi.highlightUpdateRect,
  highlightUpdateLabel: aiReaderApi.highlightUpdateLabel,
  highlightDelete: aiReaderApi.highlightDelete,
  pdfNoteCreate: (paperId: string, input: PdfTextNoteCreateInput) =>
    invokeParsed("pdf_note_create", { paperId, input }, parsePdfTextNote),
  pdfNoteList: (paperId: string) =>
    invokeParsed("pdf_note_list", { paperId }, (value, path) =>
      parseArray(value, path, parsePdfTextNote),
    ),
  pdfNoteUpdate: (id: string, patch: PdfTextNotePatch) =>
    invokeParsed("pdf_note_update", { id, patch }, parsePdfTextNote),
  pdfNoteDelete: (id: string, expectedRevision: number) =>
    invoke<void>("pdf_note_delete", { id, expectedRevision }),
  pdfNoteSearch: (query: string, paperId?: string | null): Promise<PdfTextNoteSearchResult[]> =>
    invokeParsed("pdf_note_search", { query, paperId: paperId ?? null }, (value, path) =>
      parseArray(value, path, parsePdfTextNoteSearchResult),
    ),
  legacyReaderNotesPreview: (): Promise<LegacyReaderNotesPreview> =>
    invokeParsed("legacy_reader_notes_preview", undefined, parseLegacyReaderNotesPreview),
  legacyReaderNotesExport: (destination?: string): Promise<LegacyReaderNotesReport> =>
    invokeParsed(
      "legacy_reader_notes_export",
      { destination: destination ?? null },
      parseLegacyReaderNotesReport,
    ),
  noteGet: aiReaderApi.noteGet,
  noteSave: aiReaderApi.noteSave,
  paperTranslatedMarkdownGet: aiReaderApi.paperTranslatedMarkdownGet,
  paperTermsList: aiReaderApi.paperTermsList,
  paperTermAdd: aiReaderApi.paperTermAdd,
  paperTermDelete: aiReaderApi.paperTermDelete,
  paperSetPdfText: aiReaderApi.paperSetPdfText,
  noteSectionsGet: knowledgeApi.noteSectionsGet,
  noteSectionsSave: knowledgeApi.noteSectionsSave,
  noteSectionsReorder: knowledgeApi.noteSectionsReorder,
  noteSectionDelete: knowledgeApi.noteSectionDelete,
};
