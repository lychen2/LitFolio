import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";

import { aiReaderApi } from "./apiAiReader";
import { knowledgeApi } from "./apiKnowledge";
import { libraryApi } from "./apiLibrary";
import type { TopicSurveyProgress } from "./types/api";

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
  EvidenceDraft,
  EvidenceItem,
  EvidenceSourceType,
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
  PaperComparison,
  PaperConcept,
  PaperCustomField,
  PaperLink,
  PaperTerm,
  PdfImportSummary,
  ProjectDraft,
  ProjectRadarCandidate,
  ProjectSourceManifest,
  ProjectStatus,
  ProjectUnreadReminder,
  ProjectWeeklyReview,
  ProjectWritingOutline,
  QueueEntry,
  QuickReadResult,
  ReadStatus,
  ReaderPaperTerm,
  ReaderTranslateResult,
  ReaderMarkdownTranslationResult,
  Recommendation,
  ResearchProject,
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

export const api = {
  ...libraryApi,
  ...aiReaderApi,
  ...knowledgeApi,
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
