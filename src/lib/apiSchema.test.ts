import { describe, expect, it } from "vitest";

import {
  parseCandidatePaper,
  parseLlmConfig,
  parsePaper,
  parseTopicAlertResult,
} from "./apiSchema";

describe("api schema parsers", () => {
  it("accepts a valid paper DTO", () => {
    expect(parsePaper(validPaper()).read_status).toBe("reading");
  });

  it("rejects paper DTOs with missing fields", () => {
    const paper = validPaper();
    delete (paper as Record<string, unknown>).title;

    expect(() => parsePaper(paper)).toThrow("Paper.title");
  });

  it("rejects paper DTOs with invalid enum values", () => {
    const paper = { ...validPaper(), read_status: "archived" };

    expect(() => parsePaper(paper)).toThrow("Paper.read_status");
  });

  it("validates LLM config task bindings", () => {
    const config = {
      profiles: [validProfile()],
      active: "default",
      task_assignments: {
        tldr: { profile: "default", model: null },
        quick_read: null,
        translate: null,
        tag: null,
        link: null,
        lit_review: null,
        topic_survey: null,
        ask: null,
      },
      output_language: "Chinese",
    };

    const parsed = parseLlmConfig(config);
    expect(parsed.task_assignments.tldr?.profile).toBe("default");
    expect(parsed.obsidian).toEqual({ vault_dir: "", folder: "Papers" });
    expect(parsed.profiles[0]).toMatchObject({ thinking_mode: "auto", thinking_format: "auto", reasoning_effort: "auto" });
    const explicit = { ...validProfile(), thinking_mode: "enabled", thinking_format: "reasoning_effort", reasoning_effort: "high" };
    expect(parseLlmConfig({ ...config, profiles: [explicit] }).profiles[0]).toEqual(explicit);
    for (const key of ["thinking_mode", "thinking_format", "reasoning_effort"]) {
      expect(() => parseLlmConfig({ ...config, profiles: [{ ...explicit, [key]: "invalid" }] }))
        .toThrow(`LlmConfig.profiles[0].${key}`);
    }
  });

  it("validates priority cross-boundary DTOs", () => {
    expect(parseCandidatePaper(validCandidate()).status).toBe("new");
    expect(parseTopicAlertResult(validTopicAlertResult()).seen).toBe(false);
  });

  it("rejects invalid priority cross-boundary DTOs with precise paths", () => {
    expect(() =>
      parseCandidatePaper({ ...validCandidate(), status: "bad" })
    ).toThrow("CandidatePaper.status");
    expect(() =>
      parseTopicAlertResult({ ...validTopicAlertResult(), seen: 0 })
    ).toThrow("TopicAlertResult.seen");
  });
});

function validPaper() {
  return {
    id: "p1",
    title: "Paper",
    authors: ["A"],
    year: 2026,
    venue: null,
    doi: null,
    arxiv_id: null,
    abstract_text: null,
    pdf_path: null,
    note_path: null,
    added_at: 1,
    updated_at: 2,
    read_status: "reading",
    tldr: null,
    research_question: null,
    method: null,
    dataset: null,
    key_findings: [],
    limitations: null,
    comparison: null,
    title_translated: null,
    abstract_translated: null,
    translate_target_lang: null,
    translated_at: null,
    bibtex: null,
  };
}

function validProfile() {
  return {
    name: "default",
    base_url: "https://example.test/v1",
    api_key: "",
    chat_model: "model",
    embed_model: null,
    max_tokens: 1024,
    temperature: 0.2,
  };
}

function validCandidate() {
  return {
    id: 1,
    title: "Candidate",
    authors: ["A"],
    year: 2026,
    venue: null,
    doi: null,
    arxiv_id: null,
    abstract_text: null,
    source_type: "semantic_scholar",
    source_url: null,
    status: "new",
    related_project: null,
    created_at: 1,
    last_seen_at: 2,
  };
}

function validTopicAlertResult() {
  return {
    id: 1,
    alert_id: 1,
    paper_doi: null,
    paper_arxiv_id: "2601.00001",
    title: "Alert result",
    authors: "A; B",
    year: 2026,
    abstract_text: null,
    seen: false,
    added_at: 1,
  };
}
