import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";

import { aiReadingClient, libraryClient, readerClient } from "@/core/data";
import { aiPluginApi } from "./apiAiPlugins";
import { knowledgeApi } from "./apiKnowledge";
import type { TopicSurveyProgress } from "./types/api";

/**
 * Compatibility aggregation only. Core clients own migrated operations;
 * `mono-plugin-integrations` removes this adapter after remaining callers move.
 */

export type {
  AiExecutionRecord,
  AiExecutionState,
  ReaderAskResult,
} from "./apiSchemaAi";

export type {
  PdfAnnotationRect,
  PdfHighlight,
  PdfTextNote,
  PdfTextNoteCreateInput,
  PdfTextNotePatch,
  PdfTextNoteSearchResult,
  ReaderAnnotation,
} from "@/core/contracts";

export type {
  ArxivDraft,
  BatchError,
  BatchSummary,
  CandidateDraft,
  CandidatePaper,
  CandidateStatus,
  ExpandedQuery,
  ExportSummary,
  Feed,
  FeedItem,
  FeedRefreshAllSummary,
  FeedRefreshResult,
  FeedWithCounts,
  Folder,
  FolderImportProgress,
  FolderWithCount,
  Highlight,
  LinkedPaper,
  LlmConfig,
  ObsidianConfig,
  JobDraft,
  JobRecord,
  JobStatus,
  LlmProfile,
  LlmTestResult,
  NoteSection,
  Paper,
  PdfMarkdownConfig,
  PdfMarkdownEngine,
  PaperTerm,
  PdfImportSummary,
  ProjectRadarCandidate,
  ProjectUnreadReminder,
  QuickReadResult,
  ReadStatus,
  ReaderPaperTerm,
  ReaderTranslateResult,
  ReaderMarkdownTranslationResult,
  RelatedPaperTerm,
  SaveTopicSurveyResult,
  SearchHit,
  SurveyKeyPi,
  SurveyPaper,
  SurveySubareaResult,
  Tag,
  TagWithCount,
  TaskAssignments,
  TaskBinding,
  TermInsight,
  TldrResult,
  TopicAlert,
  TopicAlertResult,
  TopicReport,
  TopicSurvey,
  TopicSurveyPhase,
  TopicSurveyProgress,
  TranslationResult,
  UnifiedSearchResult,
  StorageStats,
} from "./types/api";

export const api = {
  ...libraryClient,
  ...aiReadingClient,
  ...readerClient,
  ...knowledgeApi,
  ...aiPluginApi,
};

/// Subscribe to backend progress events for an in-flight `topic_survey` call.
/// Returns the unlisten function. Callers must unlisten on unmount.
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
