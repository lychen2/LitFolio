import type { TopicSurvey } from "@/lib/api";

export function toggleSurveyMustRead(survey: TopicSurvey, paperId: string): TopicSurvey {
  const currentlyMustRead = survey.must_read_ids.includes(paperId);
  const mustReadIds = currentlyMustRead
    ? survey.must_read_ids.filter((id) => id !== paperId)
    : [...survey.must_read_ids, paperId];
  return {
    ...survey,
    must_read_ids: mustReadIds,
    subareas: survey.subareas.map((subarea) => ({
      ...subarea,
      papers: subarea.papers.map((paper) => (
        paper.id === paperId ? { ...paper, must_read: !currentlyMustRead } : paper
      )),
    })),
  };
}

export function updateSurveySubareaSummary(
  survey: TopicSurvey,
  subareaName: string,
  summary: string,
): TopicSurvey {
  return {
    ...survey,
    subareas: survey.subareas.map((subarea) => (
      subarea.name === subareaName ? { ...subarea, summary } : subarea
    )),
  };
}

export function surveySourcePaperCount(survey: TopicSurvey): number {
  return new Set(survey.subareas.flatMap((subarea) => subarea.papers.map((paper) => paper.id))).size;
}
