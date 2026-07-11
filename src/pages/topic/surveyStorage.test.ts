import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TopicSurvey } from "@/lib/api";
import { loadCurrentSurvey, loadSavedSurveys, persistSavedSurveys, saveCurrentSurvey, upsertSavedSurvey } from "./surveyStorage";

const store = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
  },
  configurable: true,
});

describe("surveyStorage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.setSystemTime(new Date("2026-06-18T00:00:00Z"));
  });

  it("persists and restores the current topic survey", () => {
    const survey = sampleSurvey("retrieval");

    saveCurrentSurvey(survey);

    expect(loadCurrentSurvey()).toEqual(survey);
  });

  it("keeps recent saved surveys locally", () => {
    const first = upsertSavedSurvey([], sampleSurvey("retrieval"));
    const second = upsertSavedSurvey(first, sampleSurvey("ranking"));

    persistSavedSurveys(second);

    expect(loadSavedSurveys().map((item) => item.topic)).toEqual(["ranking", "retrieval"]);
  });
});

function sampleSurvey(topic: string): TopicSurvey {
  return {
    topic,
    subareas: [],
    key_pis: [],
    must_read_ids: [],
    annotated: false,
    plan_model: "test",
    plan_tokens: 0,
    annotate_model: null,
    annotate_tokens: 0,
  };
}
