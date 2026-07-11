import { beforeEach, describe, expect, it } from "vitest";
import type { TopicReport } from "@/lib/api";
import { loadCurrentTopicReport, saveCurrentTopicReport } from "./topicSearchStorage";

const store = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
  },
  configurable: true,
});

describe("topicSearchStorage", () => {
  beforeEach(() => localStorage.clear());

  it("persists and restores the latest topic search report", () => {
    const report = sampleReport();

    saveCurrentTopicReport(report, ["retrieval", "ranking"]);

    expect(loadCurrentTopicReport()).toEqual({ report, expandedTerms: ["retrieval", "ranking"] });
  });

  it("returns null for corrupted storage", () => {
    localStorage.setItem("litera.topic.search.current", "not-json");

    expect(loadCurrentTopicReport()).toBeNull();
  });
});

function sampleReport(): TopicReport {
  return {
    query: "retrieval",
    recent_year_from: 2022,
    recent_year_to: 2026,
    recent: [],
    classic: [],
  };
}
