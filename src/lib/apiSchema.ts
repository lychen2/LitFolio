import type {
  ArxivDraft,
  FeedItem,
  FeedWithCounts,
  GraphData,
  GraphEdge,
  GraphNode,
  Highlight,
  LlmConfig,
  LlmProfile,
  Paper,
  PdfImportSummary,
  ReadStatus,
  TaskAssignments,
  TaskBinding,
} from "./types/api";
import {
  booleanField,
  enumStringField,
  field,
  nullableNumberField,
  nullableStringField,
  numberField,
  object,
  optionalNumberField,
  optionalStringField,
  parseArray,
  parseNullable,
  stringArrayField,
  stringField,
  type Shape,
} from "./apiSchemaCore";

const READ_STATUSES = new Set<ReadStatus>(["unread", "reading", "read", "must"]);
const NODE_TYPES = new Set(["paper", "concept"]);
const EDGE_SOURCE_TYPES = new Set(["user", "ai", "derived"]);

export function parsePaper(value: unknown, path = "Paper"): Paper {
  const obj = object(value, path);
  return {
    id: stringField(obj, "id", path),
    title: stringField(obj, "title", path),
    authors: stringArrayField(obj, "authors", path),
    year: nullableNumberField(obj, "year", path),
    venue: nullableStringField(obj, "venue", path),
    doi: nullableStringField(obj, "doi", path),
    arxiv_id: nullableStringField(obj, "arxiv_id", path),
    abstract_text: nullableStringField(obj, "abstract_text", path),
    pdf_path: nullableStringField(obj, "pdf_path", path),
    note_path: nullableStringField(obj, "note_path", path),
    added_at: numberField(obj, "added_at", path),
    updated_at: numberField(obj, "updated_at", path),
    read_status: readStatusField(obj, "read_status", path),
    tldr: nullableStringField(obj, "tldr", path),
    research_question: nullableStringField(obj, "research_question", path),
    method: nullableStringField(obj, "method", path),
    dataset: nullableStringField(obj, "dataset", path),
    key_findings: stringArrayField(obj, "key_findings", path),
    limitations: nullableStringField(obj, "limitations", path),
    comparison: nullableStringField(obj, "comparison", path),
    title_translated: nullableStringField(obj, "title_translated", path),
    abstract_translated: nullableStringField(obj, "abstract_translated", path),
    translate_target_lang: nullableStringField(obj, "translate_target_lang", path),
    translated_at: nullableNumberField(obj, "translated_at", path),
    bibtex: nullableStringField(obj, "bibtex", path),
  };
}

export function parsePdfImportSummary(value: unknown, path = "PdfImportSummary"): PdfImportSummary {
  const obj = object(value, path);
  return {
    imported: parseArray(field(obj, "imported", path), `${path}.imported`, parsePaper),
    failed: parseArray(field(obj, "failed", path), `${path}.failed`, parsePdfFailure),
  };
}

export function parseLlmConfig(value: unknown, path = "LlmConfig"): LlmConfig {
  const obj = object(value, path);
  return {
    profiles: parseArray(field(obj, "profiles", path), `${path}.profiles`, parseLlmProfile),
    active: nullableStringField(obj, "active", path),
    task_assignments: parseTaskAssignments(field(obj, "task_assignments", path), `${path}.task_assignments`),
    output_language: stringField(obj, "output_language", path),
  };
}

export function parseHighlight(value: unknown, path = "Highlight"): Highlight {
  const obj = object(value, path);
  return {
    id: stringField(obj, "id", path),
    paper_id: stringField(obj, "paper_id", path),
    page: numberField(obj, "page", path),
    rect: field(obj, "rect", path),
    color: stringField(obj, "color", path),
    label: nullableStringField(obj, "label", path),
    text: stringField(obj, "text", path),
    note: nullableStringField(obj, "note", path),
    summary_text: nullableStringField(obj, "summary_text", path),
    summary_model: nullableStringField(obj, "summary_model", path),
    summarized_at: nullableNumberField(obj, "summarized_at", path),
    translation_text: nullableStringField(obj, "translation_text", path),
    translation_target_lang: nullableStringField(obj, "translation_target_lang", path),
    translation_model: nullableStringField(obj, "translation_model", path),
    translated_at: nullableNumberField(obj, "translated_at", path),
    explanation_text: nullableStringField(obj, "explanation_text", path),
    explanation_model: nullableStringField(obj, "explanation_model", path),
    explained_at: nullableNumberField(obj, "explained_at", path),
    created_at: numberField(obj, "created_at", path),
  };
}

export function parseGraphData(value: unknown, path = "GraphData"): GraphData {
  const obj = object(value, path);
  return {
    nodes: parseArray(field(obj, "nodes", path), `${path}.nodes`, parseGraphNode),
    edges: parseArray(field(obj, "edges", path), `${path}.edges`, parseGraphEdge),
  };
}

export function parseFeedWithCounts(value: unknown, path = "FeedWithCounts"): FeedWithCounts {
  const obj = object(value, path);
  return {
    id: numberField(obj, "id", path),
    url: stringField(obj, "url", path),
    title: stringField(obj, "title", path),
    description: nullableStringField(obj, "description", path),
    etag: nullableStringField(obj, "etag", path),
    last_modified: nullableStringField(obj, "last_modified", path),
    last_fetched_at: nullableNumberField(obj, "last_fetched_at", path),
    last_error: nullableStringField(obj, "last_error", path),
    created_at: numberField(obj, "created_at", path),
    total_items: numberField(obj, "total_items", path),
    unread_items: numberField(obj, "unread_items", path),
  };
}

export function parseFeedItem(value: unknown, path = "FeedItem"): FeedItem {
  const obj = object(value, path);
  return {
    id: stringField(obj, "id", path),
    feed_id: numberField(obj, "feed_id", path),
    entry_id: stringField(obj, "entry_id", path),
    title: stringField(obj, "title", path),
    link: nullableStringField(obj, "link", path),
    summary: nullableStringField(obj, "summary", path),
    authors: stringArrayField(obj, "authors", path),
    published_at: nullableNumberField(obj, "published_at", path),
    fetched_at: numberField(obj, "fetched_at", path),
    seen: booleanField(obj, "seen", path),
    imported_paper_id: nullableStringField(obj, "imported_paper_id", path),
    metadata: parseNullable(field(obj, "metadata", path), `${path}.metadata`, parseArxivDraft),
    metadata_source: nullableStringField(obj, "metadata_source", path),
    metadata_checked_at: nullableNumberField(obj, "metadata_checked_at", path),
  };
}

export function parseArxivDraft(value: unknown, path = "ArxivDraft"): ArxivDraft {
  const obj = object(value, path);
  return {
    title: stringField(obj, "title", path),
    authors: stringArrayField(obj, "authors", path),
    year: nullableNumberField(obj, "year", path),
    venue: nullableStringField(obj, "venue", path),
    doi: nullableStringField(obj, "doi", path),
    arxiv_id: nullableStringField(obj, "arxiv_id", path),
    abstract_text: nullableStringField(obj, "abstract_text", path),
  };
}

function parseLlmProfile(value: unknown, path: string): LlmProfile {
  const obj = object(value, path);
  return {
    name: stringField(obj, "name", path),
    base_url: stringField(obj, "base_url", path),
    api_key: stringField(obj, "api_key", path),
    chat_model: stringField(obj, "chat_model", path),
    embed_model: nullableStringField(obj, "embed_model", path),
    max_tokens: numberField(obj, "max_tokens", path),
    temperature: numberField(obj, "temperature", path),
  };
}

function parseTaskAssignments(value: unknown, path: string): TaskAssignments {
  const obj = object(value, path);
  return {
    tldr: parseTaskBindingField(obj, "tldr", path),
    quick_read: parseTaskBindingField(obj, "quick_read", path),
    translate: parseTaskBindingField(obj, "translate", path),
    tag: parseTaskBindingField(obj, "tag", path),
    link: parseTaskBindingField(obj, "link", path),
    topic_survey: parseTaskBindingField(obj, "topic_survey", path),
    ask: parseTaskBindingField(obj, "ask", path),
  };
}

function parseTaskBindingField(obj: Shape, key: string, path: string): TaskBinding | null {
  return parseNullable(field(obj, key, path), `${path}.${key}`, parseTaskBinding);
}

function parseTaskBinding(value: unknown, path: string): TaskBinding {
  const obj = object(value, path);
  return {
    profile: stringField(obj, "profile", path),
    model: nullableStringField(obj, "model", path),
  };
}

function parseGraphNode(value: unknown, path: string): GraphNode {
  const obj = object(value, path);
  const nodeType = enumStringField(obj, "node_type", path, NODE_TYPES);
  return {
    id: stringField(obj, "id", path),
    node_type: nodeType as GraphNode["node_type"],
    label: stringField(obj, "label", path),
    sublabel: nullableStringField(obj, "sublabel", path),
    year: optionalNumberField(obj, "year", path),
    read_status: optionalStringField(obj, "read_status", path),
    paper_count: optionalNumberField(obj, "paper_count", path),
  };
}

function parseGraphEdge(value: unknown, path: string): GraphEdge {
  const obj = object(value, path);
  const sourceType = enumStringField(obj, "source_type", path, EDGE_SOURCE_TYPES);
  return {
    id: stringField(obj, "id", path),
    source: stringField(obj, "source", path),
    target: stringField(obj, "target", path),
    edge_type: stringField(obj, "edge_type", path),
    source_type: sourceType as GraphEdge["source_type"],
    confidence: numberField(obj, "confidence", path),
    snippet: nullableStringField(obj, "snippet", path),
  };
}

function parsePdfFailure(value: unknown, path: string): { path: string; error: string } {
  const obj = object(value, path);
  return {
    path: stringField(obj, "path", path),
    error: stringField(obj, "error", path),
  };
}

function readStatusField(obj: Shape, key: string, path: string): ReadStatus {
  const value = enumStringField(obj, key, path, READ_STATUSES);
  return value as ReadStatus;
}
