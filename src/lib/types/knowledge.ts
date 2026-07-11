import type { Paper } from "./library";

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

export type CandidateStatus = "new" | "shortlisted" | "queued" | "ignored" | "imported";

export interface CandidatePaper {
  id: number;
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  doi: string | null;
  arxiv_id: string | null;
  abstract_text: string | null;
  source_type: string;
  source_url: string | null;
  status: CandidateStatus;
  related_project: string | null;
  created_at: number;
  last_seen_at: number;
}

export interface CandidateDraft {
  title: string;
  authors: string[];
  year: number | null;
  venue: string | null;
  doi: string | null;
  arxiv_id: string | null;
  abstract_text: string | null;
  source_type: string;
  source_url: string | null;
}

export type ProjectStatus = "active" | "paused" | "archived";

export interface ResearchProject {
  id: number;
  name: string;
  description: string | null;
  research_question: string | null;
  target_output: string | null;
  status: ProjectStatus;
  due_date: number | null;
  paper_count: number;
  created_at: number;
  updated_at: number;
}

export interface ProjectDraft {
  name: string;
  description: string | null;
  research_question: string | null;
  target_output: string | null;
  status: ProjectStatus;
  due_date: number | null;
}

export interface ProjectWeeklyReview {
  project: ResearchProject;
  generated_at: number;
  week_start: number;
  topic_terms: string[];
  candidates: ProjectRadarCandidate[];
  unread_core_papers: ProjectUnreadReminder[];
  recent_project_papers: Paper[];
}

export interface ProjectRadarCandidate {
  candidate: CandidatePaper;
  reason: string;
  matched_terms: string[];
}

export interface ProjectUnreadReminder {
  paper: Paper;
  reason: string;
}

export interface ProjectWritingOutline {
  project: ResearchProject;
  generated_at: number;
  markdown: string;
  paper_count: number;
  source_count: number;
  section_count: number;
}

export interface ProjectSourceManifest {
  project: ResearchProject;
  generated_at: number;
  markdown: string;
  paper_count: number;
  pdf_count: number;
  note_section_count: number;
}

export type EvidenceSourceType = "highlight" | "ask" | "comparison" | "note" | "manual";

export interface EvidenceItem {
  id: number;
  project_id: number;
  source_type: EvidenceSourceType | string;
  paper_id: string | null;
  paper_title: string | null;
  highlight_id: string | null;
  page: number | null;
  label: string | null;
  excerpt: string;
  note: string | null;
  created_at: number;
  updated_at: number;
}

export interface EvidenceDraft {
  source_type: EvidenceSourceType | string;
  paper_id: string | null;
  highlight_id: string | null;
  page: number | null;
  label: string | null;
  excerpt: string;
  note: string | null;
}

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

export type GraphNodeType = "paper" | "concept" | "tag" | "folder";
export type GraphEdgeType = "citation" | "similar" | "manual" | "concept";

export interface GraphNode {
  id: string;
  node_type: GraphNodeType;
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
  edge_type: GraphEdgeType;
  relation?: string | null;
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
