import type {
  AskCapabilityState,
  AskSession,
  ArxivDraft,
  CandidatePaper,
  CandidateStatus,
  FeedItem,
  FeedWithCounts,
  GraphData,
  GraphEdge,
  GraphNode,
  Highlight,
  JobRecord,
  JobStatus,
  LlmConfig,
  LlmProfile,
  Paper,
  PdfImportSummary,
  PaperSupplement,
  SupplementConversionResult,
  ReadStatus,
  TaskAssignments,
  TaskBinding,
  TopicAlertResult,
  StorageStats,
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
import type {
  SyncPreviewAction,
  SyncPreviewChange,
  SyncPreviewDirection,
  SyncPreviewReport,
  SyncReport,
} from "./syncApi";

const READ_STATUSES = new Set<ReadStatus>([
  "unread",
  "reading",
  "read",
  "must",
]);
const CANDIDATE_STATUSES = new Set<CandidateStatus>([
  "new",
  "shortlisted",
  "queued",
  "ignored",
  "imported",
]);
const PDF_MARKDOWN_ENGINES = new Set([
  "local",
  "mineru-agent",
  "mineru-precise",
]);
const NODE_TYPES = new Set(["paper", "concept", "tag", "folder"]);
const EDGE_TYPES = new Set(["citation", "similar", "manual", "concept"]);
const EDGE_SOURCE_TYPES = new Set(["user", "ai", "derived"]);
const SYNC_PREVIEW_DIRECTIONS = new Set<SyncPreviewDirection>(["push", "pull"]);
const SYNC_PREVIEW_ACTIONS = new Set<SyncPreviewAction>([
  "upload_new",
  "upload_replace",
  "delete_remote",
  "download_new",
  "download_replace",
  "delete_local",
]);
const JOB_STATUSES = new Set<JobStatus>([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);
const ASK_CAPABILITY_STATES = new Set([
  "search_only",
  "needs_model",
  "answer_ready",
  "indexing",
  "degraded",
]);



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
    translate_target_lang: nullableStringField(
      obj,
      "translate_target_lang",
      path
    ),
    translated_at: nullableNumberField(obj, "translated_at", path),
    bibtex: nullableStringField(obj, "bibtex", path),
  };
}

export function parsePaperSupplement(value: unknown, path = "PaperSupplement"): PaperSupplement {
  const obj = object(value, path);
  return {
    id: numberField(obj, "id", path),
    paper_id: stringField(obj, "paper_id", path),
    title: stringField(obj, "title", path),
    file_path: stringField(obj, "file_path", path),
    file_kind: stringField(obj, "file_kind", path),
    note: stringField(obj, "note", path),
    converted_pdf_path: nullableStringField(obj, "converted_pdf_path", path),
    created_at: numberField(obj, "created_at", path),
    updated_at: numberField(obj, "updated_at", path),
  };
}

export function parseSupplementConversionResult(
  value: unknown,
  path = "SupplementConversionResult",
): SupplementConversionResult {
  const obj = object(value, path);
  return {
    supplement: parsePaperSupplement(field(obj, "supplement", path), `${path}.supplement`),
    pdf_path: stringField(obj, "pdf_path", path),
  };
}

export function parsePdfImportSummary(
  value: unknown,
  path = "PdfImportSummary"
): PdfImportSummary {
  const obj = object(value, path);
  return {
    imported: parseArray(
      field(obj, "imported", path),
      `${path}.imported`,
      parsePaper
    ),
    failed: parseArray(
      field(obj, "failed", path),
      `${path}.failed`,
      parsePdfFailure
    ),
  };
}

export function parseAskSession(value: unknown, path = "AskSession"): AskSession {
  const obj = object(value, path);
  return {
    id: stringField(obj, "id", path),
    project_id: nullableNumberField(obj, "project_id", path),
    title: stringField(obj, "title", path),
    pinned_paper_ids: stringArrayField(obj, "pinned_paper_ids", path),
    model: nullableStringField(obj, "model", path),
    conversation: field(obj, "conversation", path),
    saved_artifacts: field(obj, "saved_artifacts", path),
    created_at: numberField(obj, "created_at", path),
    updated_at: numberField(obj, "updated_at", path),
  };
}

export function parseAskSessionMaybe(
  value: unknown,
  path = "AskSession | null"
): AskSession | null {
  if (value === null || value === undefined) return null;
  return parseAskSession(value, path);
}


export function parseAskCapabilityState(
  value: unknown,
  path = "AskCapabilityState"
): AskCapabilityState {
  const obj = object(value, path);
  const state = enumStringField(
    obj,
    "state",
    path,
    ASK_CAPABILITY_STATES
  ) as AskCapabilityState["state"];
  return {
    state,
    has_model: booleanField(obj, "has_model", path),
    indexed_documents: numberField(obj, "indexed_documents", path),
    failed_documents: numberField(obj, "failed_documents", path),
    total_documents: numberField(obj, "total_documents", path),
    reason: nullableStringField(obj, "reason", path),
  };
}
export function parseJobRecord(value: unknown, path = "JobRecord"): JobRecord {
  const obj = object(value, path);
  return {
    id: stringField(obj, "id", path),
    kind: stringField(obj, "kind", path),
    scope: nullableStringField(obj, "scope", path),
    title: stringField(obj, "title", path),
    status: jobStatusField(obj, "status", path),
    details: field(obj, "details", path),
    progress_current: numberField(obj, "progress_current", path),
    progress_total: numberField(obj, "progress_total", path),
    error: nullableStringField(obj, "error", path),
    attempts: numberField(obj, "attempts", path),
    max_attempts: numberField(obj, "max_attempts", path),
    created_at: numberField(obj, "created_at", path),
    updated_at: numberField(obj, "updated_at", path),
    started_at: nullableNumberField(obj, "started_at", path),
    finished_at: nullableNumberField(obj, "finished_at", path),
  };
}


export function parseLlmConfig(value: unknown, path = "LlmConfig"): LlmConfig {
  const obj = object(value, path);
  return {
    profiles: parseArray(
      field(obj, "profiles", path),
      `${path}.profiles`,
      parseLlmProfile
    ),
    active: nullableStringField(obj, "active", path),
    task_assignments: parseTaskAssignments(
      field(obj, "task_assignments", path),
      `${path}.task_assignments`
    ),
    output_language: stringField(obj, "output_language", path),
    pdf_markdown: parsePdfMarkdownConfig(
      obj.pdf_markdown ?? {},
      `${path}.pdf_markdown`
    ),
    obsidian: parseObsidianConfig(obj.obsidian ?? {}, `${path}.obsidian`),
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
    translation_target_lang: nullableStringField(
      obj,
      "translation_target_lang",
      path
    ),
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
    nodes: parseArray(
      field(obj, "nodes", path),
      `${path}.nodes`,
      parseGraphNode
    ),
    edges: parseArray(
      field(obj, "edges", path),
      `${path}.edges`,
      parseGraphEdge
    ),
  };
}

export function parseFeedWithCounts(
  value: unknown,
  path = "FeedWithCounts"
): FeedWithCounts {
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
    metadata: parseNullable(
      field(obj, "metadata", path),
      `${path}.metadata`,
      parseArxivDraft
    ),
    metadata_source: nullableStringField(obj, "metadata_source", path),
    metadata_checked_at: nullableNumberField(obj, "metadata_checked_at", path),
  };
}

export function parseArxivDraft(
  value: unknown,
  path = "ArxivDraft"
): ArxivDraft {
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

export function parseCandidatePaper(
  value: unknown,
  path = "CandidatePaper"
): CandidatePaper {
  const obj = object(value, path);
  return {
    id: numberField(obj, "id", path),
    title: stringField(obj, "title", path),
    authors: stringArrayField(obj, "authors", path),
    year: nullableNumberField(obj, "year", path),
    venue: nullableStringField(obj, "venue", path),
    doi: nullableStringField(obj, "doi", path),
    arxiv_id: nullableStringField(obj, "arxiv_id", path),
    abstract_text: nullableStringField(obj, "abstract_text", path),
    source_type: stringField(obj, "source_type", path),
    source_url: nullableStringField(obj, "source_url", path),
    status: candidateStatusField(obj, "status", path),
    related_project: nullableStringField(obj, "related_project", path),
    created_at: numberField(obj, "created_at", path),
    last_seen_at: numberField(obj, "last_seen_at", path),
  };
}

export function parseTopicAlertResult(
  value: unknown,
  path = "TopicAlertResult"
): TopicAlertResult {
  const obj = object(value, path);
  return {
    id: numberField(obj, "id", path),
    alert_id: numberField(obj, "alert_id", path),
    paper_doi: nullableStringField(obj, "paper_doi", path),
    paper_arxiv_id: nullableStringField(obj, "paper_arxiv_id", path),
    title: stringField(obj, "title", path),
    authors: nullableStringField(obj, "authors", path),
    year: nullableNumberField(obj, "year", path),
    abstract_text: nullableStringField(obj, "abstract_text", path),
    seen: booleanField(obj, "seen", path),
    added_at: numberField(obj, "added_at", path),
  };
}

export function parseSyncReport(
  value: unknown,
  path = "SyncReport"
): SyncReport {
  const obj = object(value, path);
  return {
    remote_root: stringField(obj, "remote_root", path),
    file_count: numberField(obj, "file_count", path),
    total_bytes: numberField(obj, "total_bytes", path),
    skipped_count: numberField(obj, "skipped_count", path),
    skipped_bytes: numberField(obj, "skipped_bytes", path),
    restart_required: booleanField(obj, "restart_required", path),
    backup_path:
      "backup_path" in obj
        ? nullableStringField(obj, "backup_path", path)
        : null,
  };
}

export function parseSyncPreviewReport(
  value: unknown,
  path = "SyncPreviewReport"
): SyncPreviewReport {
  const obj = object(value, path);
  return {
    direction: syncPreviewDirectionField(obj, "direction", path),
    remote_root: stringField(obj, "remote_root", path),
    add_count: numberField(obj, "add_count", path),
    update_count: numberField(obj, "update_count", path),
    delete_count: numberField(obj, "delete_count", path),
    unchanged_count: numberField(obj, "unchanged_count", path),
    transfer_bytes: numberField(obj, "transfer_bytes", path),
    restart_required: booleanField(obj, "restart_required", path),
    backup_path:
      "backup_path" in obj
        ? nullableStringField(obj, "backup_path", path)
        : null,
    changes: parseArray(
      field(obj, "changes", path),
      `${path}.changes`,
      parseSyncPreviewChange
    ),
  };
}

function parseSyncPreviewChange(
  value: unknown,
  path: string
): SyncPreviewChange {
  const obj = object(value, path);
  return {
    path: stringField(obj, "path", path),
    action: syncPreviewActionField(obj, "action", path),
    size: numberField(obj, "size", path),
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

function parsePdfMarkdownConfig(
  value: unknown,
  path: string
): LlmConfig["pdf_markdown"] {
  const obj = object(value, path);
  const engine =
    "engine" in obj
      ? enumStringField(obj, "engine", path, PDF_MARKDOWN_ENGINES)
      : "local";
  const mineruToken =
    "mineru_token" in obj ? stringField(obj, "mineru_token", path) : "";
  return {
    engine: engine as LlmConfig["pdf_markdown"]["engine"],
    mineru_token: mineruToken,
  };
}

function parseObsidianConfig(
  value: unknown,
  path: string
): LlmConfig["obsidian"] {
  const obj = object(value, path);
  return {
    vault_dir: "vault_dir" in obj ? stringField(obj, "vault_dir", path) : "",
    folder: "folder" in obj ? stringField(obj, "folder", path) : "Papers",
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
    lit_review: parseTaskBindingField(obj, "lit_review", path),
  };
}

function parseTaskBindingField(
  obj: Shape,
  key: string,
  path: string
): TaskBinding | null {
  return parseNullable(
    field(obj, key, path),
    `${path}.${key}`,
    parseTaskBinding
  );
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
  const edgeType = enumStringField(obj, "edge_type", path, EDGE_TYPES);
  const sourceType = enumStringField(
    obj,
    "source_type",
    path,
    EDGE_SOURCE_TYPES
  );
  return {
    id: stringField(obj, "id", path),
    source: stringField(obj, "source", path),
    target: stringField(obj, "target", path),
    edge_type: edgeType as GraphEdge["edge_type"],
    relation: "relation" in obj ? nullableStringField(obj, "relation", path) : null,
    source_type: sourceType as GraphEdge["source_type"],
    confidence: numberField(obj, "confidence", path),
    snippet: nullableStringField(obj, "snippet", path),
  };
}

function parsePdfFailure(
  value: unknown,
  path: string
): { path: string; error: string } {
  const obj = object(value, path);
  return {
    path: stringField(obj, "path", path),
    error: stringField(obj, "error", path),
  };
}

function jobStatusField(obj: Shape, key: string, path: string): JobStatus {
  const value = enumStringField(obj, key, path, JOB_STATUSES);
  return value as JobStatus;
}

function readStatusField(obj: Shape, key: string, path: string): ReadStatus {
  const value = enumStringField(obj, key, path, READ_STATUSES);
  return value as ReadStatus;
}

function candidateStatusField(
  obj: Shape,
  key: string,
  path: string
): CandidateStatus {
  const value = enumStringField(obj, key, path, CANDIDATE_STATUSES);
  return value as CandidateStatus;
}

function syncPreviewDirectionField(
  obj: Shape,
  key: string,
  path: string
): SyncPreviewDirection {
  const value = enumStringField(obj, key, path, SYNC_PREVIEW_DIRECTIONS);
  return value as SyncPreviewDirection;
}

function syncPreviewActionField(
  obj: Shape,
  key: string,
  path: string
): SyncPreviewAction {
  const value = enumStringField(obj, key, path, SYNC_PREVIEW_ACTIONS);
  return value as SyncPreviewAction;
}

export function parseStorageStats(value: unknown, path = "StorageStats"): StorageStats {
  const obj = object(value, path);
  return {
    papers_bytes: numberField(obj, "papers_bytes", path),
    notes_bytes: numberField(obj, "notes_bytes", path),
    attachments_bytes: numberField(obj, "attachments_bytes", path),
    vectors_bytes: numberField(obj, "vectors_bytes", path),
    database_bytes: numberField(obj, "database_bytes", path),
  };
}
