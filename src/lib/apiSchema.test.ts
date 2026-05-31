import { describe, expect, it } from "vitest";

import { parseGraphData, parseLlmConfig, parsePaper } from "./apiSchema";

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
        topic_survey: null,
        ask: null,
      },
      output_language: "Chinese",
    };

    expect(parseLlmConfig(config).task_assignments.tldr?.profile).toBe("default");
  });

  it("rejects malformed graph nodes with precise paths", () => {
    const graph = {
      nodes: [{ id: "n1", node_type: "unknown", label: "N", sublabel: null }],
      edges: [],
    };

    expect(() => parseGraphData(graph, "graph_data")).toThrow("graph_data.nodes[0].node_type");
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
