import { invoke } from "@tauri-apps/api/core";
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
  AskCapabilityKind,
  AskCapabilityState,
  AskSession,
  AskSessionDraft,
  AskLibraryResult,
  AskSource,
  BatchError,
  BatchSummary,
  CitationGraph,
  CitationPaper,
  CandidateDraft,
  CandidatePaper,
  CandidateStatus,
  Concept,
  ConceptRelation,
  CustomFieldDef,
  DuplicatePair,
  ExpandedQuery,
  ExportSummary,
  ExtractedConcept,
  ExtractedRelation,
  Feed,
  FeedItem,
  FeedRefreshAllSummary,
  FeedRefreshResult,
  FeedWithCounts,
  FilterRule,
  FilterRuleCondition,
  FilterRuleGroup,
  Folder,
  FolderImportProgress,
  FolderWithCount,
  GraphData,
  GraphEdge,
  GraphFilter,
  GraphNode,
  Highlight,
  LinkBatchSummary,
  LinkedPaper,
  LitReviewResult,
  LlmConfig,
  ObsidianConfig,
  JobDraft,
  JobRecord,
  JobStatus,
  LlmProfile,
  LlmTestResult,
  NoteSection,
  Paper,
  PaperSupplement,
  PdfMarkdownConfig,
  PdfMarkdownEngine,
  PaperConcept,
  PaperCustomField,
  PaperLink,
  PaperTerm,
  PdfImportSummary,
  ProjectRadarCandidate,
  ProjectUnreadReminder,
  QueueEntry,
  QuickReadResult,
  ReadStatus,
  ReaderPaperTerm,
  ReaderTranslateResult,
  ReaderMarkdownTranslationResult,
  Recommendation,
  RelatedPaperTerm,
  SaveAskNoteInput,
  SaveAskNoteResult,
  SaveTopicSurveyResult,
  SearchHit,
  SmartCollection,
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
  SupplementConversionResult,
  TranslationResult,
  UnifiedSearchResult,
  StorageStats,
} from "./types/api";

export interface ZoteroConfig {
  target_id: string | null;
  target_name: string | null;
}

export interface ZoteroTarget {
  id: string;
  name: string;
  level: number;
}

export interface ZoteroPushResult {
  pushed: number;
  skipped: string[];
  session_ids: string[];
}

export const zoteroApi = {
  zoteroGetConfig: () => invoke<ZoteroConfig>("zotero_get_config"),
  zoteroSaveConfig: (config: ZoteroConfig) => invoke<void>("zotero_save_config", { cfg: config }),
  zoteroTest: () => invoke<void>("zotero_test"),
  zoteroListTargets: () => invoke<ZoteroTarget[]>("zotero_list_targets"),
  zoteroPush: (paperIds: string[], force = false) =>
    invoke<ZoteroPushResult>("zotero_push", { paperIds, force }),
};

export const api = {
  ...libraryClient,
  ...aiReadingClient,
  ...readerClient,
  ...knowledgeApi,
  ...zoteroApi,
  // Temporary adapter: plugin-owned AI capabilities pending plugin-host extraction.
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
