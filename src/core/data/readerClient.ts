import { aiReaderApi } from "@/lib/apiAiReader";
import { knowledgeApi } from "@/lib/apiKnowledge";

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
