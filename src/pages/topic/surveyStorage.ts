import type { TopicSurvey } from "@/lib/api";

const SAVED_SURVEYS_KEY = "litera.topic.surveys";
const CURRENT_SURVEY_KEY = "litera.topic.current";

export interface SavedSurvey {
  id: string;
  topic: string;
  savedAt: number;
  survey: TopicSurvey;
}

export function loadCurrentSurvey(): TopicSurvey | null {
  try {
    const raw = localStorage.getItem(CURRENT_SURVEY_KEY);
    return raw ? JSON.parse(raw) as TopicSurvey : null;
  } catch {
    return null;
  }
}

export function saveCurrentSurvey(survey: TopicSurvey) {
  localStorage.setItem(CURRENT_SURVEY_KEY, JSON.stringify(survey));
}

export function loadSavedSurveys(): SavedSurvey[] {
  try {
    const raw = localStorage.getItem(SAVED_SURVEYS_KEY);
    return raw ? JSON.parse(raw) as SavedSurvey[] : [];
  } catch {
    return [];
  }
}

export function persistSavedSurveys(items: SavedSurvey[]) {
  localStorage.setItem(SAVED_SURVEYS_KEY, JSON.stringify(items));
}

export function upsertSavedSurvey(items: SavedSurvey[], survey: TopicSurvey): SavedSurvey[] {
  const now = Date.now();
  const entry: SavedSurvey = {
    id: `${now}`,
    topic: survey.topic,
    savedAt: now,
    survey,
  };
  return [entry, ...items].slice(0, 20);
}
