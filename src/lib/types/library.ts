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
  read_status: ReadStatus;
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

export interface PaperSupplement {
  id: number;
  paper_id: string;
  title: string;
  file_path: string;
  file_kind: string;
  note: string;
  converted_pdf_path: string | null;
  created_at: number;
  updated_at: number;
}

export interface SupplementConversionResult {
  supplement: PaperSupplement;
  pdf_path: string;
}

export type ReadStatus = "unread" | "reading" | "read" | "must";

export interface PdfImportSummary {
  imported: Paper[];
  failed: { path: string; error: string }[];
}

export type JobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface JobRecord {
  id: string;
  kind: string;
  scope: string | null;
  title: string;
  status: JobStatus;
  details: unknown;
  progress_current: number;
  progress_total: number;
  error: string | null;
  attempts: number;
  max_attempts: number;
  created_at: number;
  updated_at: number;
  started_at: number | null;
  finished_at: number | null;
}

export interface JobDraft {
  kind: string;
  scope?: string | null;
  title: string;
  details?: unknown;
  max_attempts?: number | null;
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

export interface SearchHit {
  paper_id: string | null;
  citation_count: number | null;
  influential_citation_count: number | null;
  draft: ArxivDraft;
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

export interface FolderImportProgress {
  phase: string;
  done: number;
  total: number;
  current_file: string;
  failed: number;
}
