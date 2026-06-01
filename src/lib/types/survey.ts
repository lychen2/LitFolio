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

export interface SaveTopicSurveyResult {
  path: string;
}

export type TopicSurveyPhase = "planning" | "grounding" | "annotating" | "done";

export interface TopicSurveyProgress {
  phase: TopicSurveyPhase;
  subarea_total?: number;
}
