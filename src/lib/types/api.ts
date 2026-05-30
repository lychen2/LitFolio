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
  metadata: ArxivDraft | null;
  metadata_source: string | null;
  metadata_checked_at: number | null;
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
  metadata_checked: number;
  errors: string[];
}
