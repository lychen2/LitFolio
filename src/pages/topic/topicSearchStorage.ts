import type { TopicReport } from "@/lib/api";

const CURRENT_TOPIC_REPORT_KEY = "litera.topic.search.current";

export interface StoredTopicReport {
  report: TopicReport;
  expandedTerms: string[] | null;
}

export function loadCurrentTopicReport(): StoredTopicReport | null {
  try {
    const raw = localStorage.getItem(CURRENT_TOPIC_REPORT_KEY);
    return raw ? (JSON.parse(raw) as StoredTopicReport) : null;
  } catch {
    return null;
  }
}

export function saveCurrentTopicReport(report: TopicReport, expandedTerms: string[] | null) {
  localStorage.setItem(CURRENT_TOPIC_REPORT_KEY, JSON.stringify({ report, expandedTerms }));
}
