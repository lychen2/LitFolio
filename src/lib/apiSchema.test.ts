import { describe, expect, it } from "vitest";

import {
  parseCandidatePaper,
  parseEvidenceItem,
  parseGraphData,
  parseLlmConfig,
  parsePaper,
  parsePaperSupplement,
  parseSupplementConversionResult,
  parseResearchProject,
  parseSyncPreviewReport,
  parseSyncReport,
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

  it("accepts supplement DTOs and conversion results", () => {
    const supplement = validSupplement();

    expect(parsePaperSupplement(supplement).converted_pdf_path).toBeNull();
    expect(
      parseSupplementConversionResult({
        supplement: { ...supplement, converted_pdf_path: "/library/papers/p1/supplement.pdf" },
        pdf_path: "/library/papers/p1/supplement.pdf",
      }).supplement.converted_pdf_path,
    ).toBe("/library/papers/p1/supplement.pdf");
  });

  it("rejects malformed supplement DTOs with precise paths", () => {
    expect(() =>
      parsePaperSupplement({ ...validSupplement(), converted_pdf_path: 1 }),
    ).toThrow("PaperSupplement.converted_pdf_path");
    expect(() =>
      parseSupplementConversionResult({ supplement: validSupplement(), pdf_path: null }),
    ).toThrow("SupplementConversionResult.pdf_path");
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

    expect(parseLlmConfig(config).task_assignments.tldr?.profile).toBe(
      "default"
    );
  });

  it("rejects malformed graph nodes with precise paths", () => {
    const graph = {
      nodes: [{ id: "n1", node_type: "unknown", label: "N", sublabel: null }],
      edges: [],
    };

    expect(() => parseGraphData(graph, "graph_data")).toThrow(
      "graph_data.nodes[0].node_type"
    );
  });

  it("validates priority cross-boundary DTOs", () => {
    expect(parseCandidatePaper(validCandidate()).status).toBe("new");
    expect(parseResearchProject(validProject()).status).toBe("active");
    expect(parseEvidenceItem(validEvidence()).source_type).toBe("highlight");
    expect(parseTopicAlertResult(validTopicAlertResult()).seen).toBe(false);
    expect(parseSyncReport(validSyncReport()).backup_path).toBeNull();
    expect(
      parseSyncPreviewReport(validSyncPreviewReport()).changes[0].action
    ).toBe("upload_new");
  });

  it("rejects invalid priority cross-boundary DTOs with precise paths", () => {
    expect(() =>
      parseCandidatePaper({ ...validCandidate(), status: "bad" })
    ).toThrow("CandidatePaper.status");
    expect(() =>
      parseResearchProject({ ...validProject(), paper_count: "1" })
    ).toThrow("ResearchProject.paper_count");
    expect(() =>
      parseEvidenceItem({ ...validEvidence(), excerpt: null })
    ).toThrow("EvidenceItem.excerpt");
    expect(() =>
      parseTopicAlertResult({ ...validTopicAlertResult(), seen: 0 })
    ).toThrow("TopicAlertResult.seen");
    expect(() =>
      parseSyncReport({ ...validSyncReport(), total_bytes: "1024" })
    ).toThrow("SyncReport.total_bytes");
    expect(() =>
      parseSyncPreviewReport({
        ...validSyncPreviewReport(),
        direction: "sideways",
      })
    ).toThrow("SyncPreviewReport.direction");
    expect(() =>
      parseSyncPreviewReport({
        ...validSyncPreviewReport(),
        changes: [{ ...validSyncPreviewReport().changes[0], action: "bad" }],
      })
    ).toThrow("SyncPreviewReport.changes[0].action");
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

function validSupplement() {
  return {
    id: 1,
    paper_id: "p1",
    title: "supplement.docx",
    file_path: "/library/papers/p1/supplements/supplement.docx",
    file_kind: "docx",
    note: "",
    converted_pdf_path: null,
    created_at: 1,
    updated_at: 2,
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

function validProject() {
  return {
    id: 1,
    name: "Project",
    description: null,
    research_question: null,
    target_output: null,
    status: "active",
    due_date: null,
    paper_count: 0,
    created_at: 1,
    updated_at: 2,
  };
}

function validEvidence() {
  return {
    id: 1,
    project_id: 1,
    source_type: "highlight",
    paper_id: "p1",
    paper_title: "Paper",
    highlight_id: "h1",
    page: 2,
    label: null,
    excerpt: "Evidence",
    note: null,
    created_at: 1,
    updated_at: 2,
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

function validSyncReport() {
  return {
    remote_root: "https://example.test/lib",
    file_count: 2,
    total_bytes: 1024,
    skipped_count: 0,
    skipped_bytes: 0,
    restart_required: false,
  };
}

function validSyncPreviewReport() {
  return {
    direction: "push",
    remote_root: "https://example.test/lib",
    add_count: 1,
    update_count: 1,
    delete_count: 0,
    unchanged_count: 2,
    transfer_bytes: 2048,
    restart_required: false,
    backup_path: null,
    changes: [
      {
        path: "papers/new/original.pdf",
        action: "upload_new",
        size: 2048,
      },
    ],
  };
}
