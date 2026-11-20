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
