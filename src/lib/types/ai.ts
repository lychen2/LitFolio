export interface LlmProfile {
  name: string;
  base_url: string;
  api_key: string;
  chat_model: string;
  embed_model: string | null;
  max_tokens: number;
  temperature: number;
}

export type PdfMarkdownEngine = "local" | "mineru-agent" | "mineru-precise";

export interface PdfMarkdownConfig {
  engine: PdfMarkdownEngine;
  mineru_token: string;
}

export interface LlmConfig {
  profiles: LlmProfile[];
  active: string | null;
  task_assignments: TaskAssignments;
  output_language: string;
  pdf_markdown: PdfMarkdownConfig;
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
  lit_review: TaskBinding | null;
}

export interface LlmTestResult {
  ok: boolean;
  model: string;
  reply: string;
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

export interface ExpandedQuery {
  original: string;
  expanded: string;
  terms: string[];
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
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
  terms: string[];
  retrieved_count: number;
}

export type AskCapabilityKind =
  | "search_only"
  | "needs_model"
  | "answer_ready"
  | "indexing"
  | "degraded";

export interface AskCapabilityState {
  state: AskCapabilityKind;
  has_model: boolean;
  indexed_documents: number;
  failed_documents: number;
  total_documents: number;
  reason: string | null;
}

export interface AskSession {
  id: string;
  project_id: number | null;
  title: string;
  pinned_paper_ids: string[];
  model: string | null;
  conversation: unknown;
  saved_artifacts: unknown;
  created_at: number;
  updated_at: number;
}

export interface AskSessionDraft {
  id?: string | null;
  project_id?: number | null;
  title: string;
  pinned_paper_ids: string[];
  model?: string | null;
  conversation: unknown;
  saved_artifacts: unknown;
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

export interface ReaderMarkdownTranslationResult {
  markdown: string;
  target_lang: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  cached: boolean;
}

export interface ReaderMarkdownTranslationEstimate {
  source_chars: number;
  cleaned_chars: number;
  chunk_count: number;
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
  explanation_text: string | null;
  explanation_model: string | null;
  explained_at: number | null;
  created_at: number;
}
