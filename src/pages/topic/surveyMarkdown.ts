import type { SurveyPaper, SurveySubareaResult, TopicSurvey } from "@/lib/api";
import { surveySourcePaperCount } from "./topicSurveyState";

export function renderTopicSurveyMarkdown(survey: TopicSurvey, generatedAt: string): string {
  const lines: string[] = [];
  const topic = survey.topic.trim() || "Untitled topic";

  lines.push(`# Topic Survey: ${topic}`, "");
  lines.push(`- Generated at: ${generatedAt}`);
  lines.push(`- Source papers: ${surveySourcePaperCount(survey)}`);
  lines.push(`- Must-read papers: ${survey.must_read_ids.length}`);
  lines.push(`- Plan model: ${survey.plan_model}`);
  lines.push(`- Annotated: ${survey.annotated ? "yes" : "no"}`);
  if (survey.annotate_model) {
    lines.push(`- Annotation model: ${survey.annotate_model}`);
  }
  lines.push("");

  writeKeyResearchers(lines, survey);
  writeSubareas(lines, survey.subareas);

  return `${lines.join("\n").trimEnd()}\n`;
}

export function topicSurveyMarkdownFilename(survey: TopicSurvey, generatedAt: string): string {
  const date = /^\d{4}-\d{2}-\d{2}/.exec(generatedAt)?.[0] ?? "undated";
  return `topic-survey-${slugifyTopic(survey.topic)}-${date}.md`;
}

function writeKeyResearchers(lines: string[], survey: TopicSurvey) {
  if (survey.key_pis.length === 0) return;

  lines.push("## Key Researchers", "");
  for (const pi of survey.key_pis) {
    lines.push(`- **${pi.name.trim()}**: ${pi.why_central.trim()}`);
  }
  lines.push("");
}

function writeSubareas(lines: string[], subareas: SurveySubareaResult[]) {
  lines.push("## Subareas", "");
  for (const subarea of subareas) {
    lines.push(`### ${subarea.name.trim()}`, "");
    if (subarea.year_range) {
      lines.push(`- Year range: ${subarea.year_range[0]}-${subarea.year_range[1]}`);
    }
    if (subarea.search_terms.length > 0) {
      lines.push(`- Search terms: ${subarea.search_terms.join(", ")}`);
    }
    lines.push("");
    pushParagraph(lines, subarea.summary);

    for (const paper of subarea.papers) {
      writePaper(lines, paper);
    }
  }
}

function writePaper(lines: string[], paper: SurveyPaper) {
  lines.push(`#### ${paper.title.trim()}`, "");
  lines.push(`- Status: ${paper.must_read ? "must-read" : "candidate"}`);
  pushListValue(lines, "Authors", paper.authors.join(", "));
  pushListValue(lines, "Year", paper.year == null ? null : String(paper.year));
  pushListValue(lines, "Venue", paper.venue);
  pushListValue(lines, "DOI", paper.doi);
  pushListValue(lines, "arXiv", paper.arxiv_id);
  pushListValue(lines, "Citations", paper.citation_count == null ? null : String(paper.citation_count));
  pushListValue(
    lines,
    "Influential citations",
    paper.influential_citation_count == null ? null : String(paper.influential_citation_count),
  );
  pushListValue(lines, "Why important", paper.why_important);
  lines.push("");
  pushParagraph(lines, paper.abstract_text);
}

function pushParagraph(lines: string[], value: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return;
  lines.push(trimmed, "");
}

function pushListValue(lines: string[], label: string, value: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return;
  lines.push(`- ${label}: ${trimmed}`);
}

function slugifyTopic(topic: string): string {
  const slug = topic
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return slug || "topic-survey";
}
