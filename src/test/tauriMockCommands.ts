import type {
  AskCapabilityState,
  AskSession,
  JobRecord,
  LlmConfig,
  Paper,
  PdfTextNote,
  QuickReadResult,
} from "@/lib/api";
import type { SyncPreviewReport, SyncReport } from "@/lib/syncApi";

const now = 1_779_999_999;

export const mockPaper: Paper = {
  id: "paper-1",
  title: "Browser Smoke Paper",
  authors: ["Ada Lovelace"],
  year: 2026,
  venue: "LitFolio E2E",
  doi: "10.1145/3530819",
  arxiv_id: null,
  abstract_text: "Fixture paper used by Playwright smoke tests.",
  pdf_path: null,
  note_path: null,
  added_at: now,
  updated_at: now,
  read_status: "unread",
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

export const mockLlmConfig: LlmConfig = {
  profiles: [],
  active: null,
  task_assignments: {
    tldr: null,
    quick_read: null,
    translate: null,
    tag: null,
    link: null,
    topic_survey: null,
    ask: null,
    lit_review: null,
  },
  output_language: "Chinese",
  pdf_markdown: { engine: "local", mineru_token: "" },
  obsidian: { vault_dir: "", folder: "Papers" },
};

export const mockAskCapabilityState: AskCapabilityState = {
  state: "needs_model",
  has_model: false,
  indexed_documents: 0,
  failed_documents: 0,
  total_documents: 0,
  reason: "no LLM profile configured; add one in Settings",
};

export const mockAskSession: AskSession = {
  id: "ask_01",
  project_id: null,
  title: "Test Ask session",
  pinned_paper_ids: [],
  model: null,
  conversation: [],
  saved_artifacts: [],
  created_at: now,
  updated_at: now,
};

export const mockPdfTextNote: PdfTextNote = {
  kind: "text-note",
  id: "pdf-note-1",
  paperId: mockPaper.id,
  rect: { page: 1, x: 24, y: 48, width: 220, height: 120 },
  content: "Browser smoke annotation",
  color: "#fff3a3",
  fontSize: 12,
  opacity: 0.9,
  revision: 0,
  createdAt: now,
  updatedAt: now,
};

export const mockQuickReadResult: QuickReadResult = {
  problem: "Test problem",
  method: "Test method",
  comparison: "Test comparison",
  limitations: "Test limitation",
  model: "mock-model",
  prompt_tokens: 0,
  completion_tokens: 0,
};

export const mockSyncReport: SyncReport = {
  remote_root: "https://dav.example.test/litfolio",
  file_count: 1,
  total_bytes: 2048,
  skipped_count: 0,
  skipped_bytes: 0,
  restart_required: false,
  backup_path: null,
};

export const mockSyncPreviewReport: SyncPreviewReport = {
  direction: "push",
  remote_root: "https://dav.example.test/litfolio",
  add_count: 1,
  update_count: 0,
  delete_count: 0,
  unchanged_count: 0,
  transfer_bytes: 2048,
  restart_required: false,
  backup_path: null,
  changes: [
    { path: "papers/demo/original.pdf", action: "upload_new", size: 2048 },
  ],
};

export const mockJobRecord: JobRecord = {
  id: "job_01",
  kind: "folder_import",
  scope: null,
  title: "Import folder",
  status: "queued",
  details: {},
  progress_current: 0,
  progress_total: 0,
  error: null,
  attempts: 0,
  max_attempts: 1,
  created_at: now,
  updated_at: now,
  started_at: null,
  finished_at: null,
};

const mockProvenanceRef = {
  contractVersion: "target-mono-v1",
  resource: { contractVersion: "target-mono-v1", domain: "document-revision", id: "rev-paper-1-1" },
  revision: { kind: "number", value: "1" },
};
const mockProvenanceSegment = {
  segmentId: "rev-paper-1-1:1",
  resourceRef: {
    ...mockProvenanceRef,
    resource: { ...mockProvenanceRef.resource, domain: "source-segment", id: "rev-paper-1-1:1" },
  },
  revisionId: "rev-paper-1-1",
  paperId: "paper-1",
  segOrder: 1,
  kind: "paragraph",
  markdown: "A source paragraph.",
  page: 1,
  rect: null,
  quoteHash: "quote-hash",
};
const mockDocumentCandidate = {
  sourceHash: "source-hash",
  sourceKind: "markdown",
  sourceUri: "paper://paper-1",
  parserOwner: "core-test",
  markdown: "# Paper",
  segments: [{ kind: "paragraph", markdown: "A source paragraph.", page: 1, rect: null }],
  assets: [],
  warnings: [],
};
const mockDocumentRevision = {
  revisionId: "rev-paper-1-1",
  resourceRef: mockProvenanceRef,
  paperId: "paper-1",
  revision: 1,
  sourceHash: "source-hash",
  sourceKind: "markdown",
  sourceUri: "paper://paper-1",
  parserOwner: "core-test",
  markdown: "# Paper",
  segments: [mockProvenanceSegment],
  acceptedAt: now,
  active: true,
};
const mockSourceLink = {
  linkId: "link-1",
  paperId: "paper-1",
  anchorDomain: "note",
  anchorId: "note-paper-1",
  segmentId: "rev-paper-1-1:1",
  revisionId: "rev-paper-1-1",
  snapshot: { page: 1, geometry: null, type: "paragraph", text: "A source paragraph.", markdown: "A source paragraph.", asset: null },
  quoteHash: "quote-hash",
  resolution: "current",
  resolvedRevisionId: "rev-paper-1-1",
  resolvedSegmentId: "rev-paper-1-1:1",
  createdAt: now,
  updatedAt: now,
};
type MockResolver = () => unknown;
const commandFixtures = new Map<string, MockResolver>([
  ["papers_recent", () => [mockPaper]],
  ["plugin_host_list", () => []],
  ["plugin_host_enable", () => ({ bindingId: "bind-fixture-local-1-test" })],
  ["plugin_host_disable", () => null],
  ["document_candidate_stage", () => mockDocumentCandidate],
  ["document_accept", () => mockDocumentRevision],
  ["document_revisions_list", () => [mockDocumentRevision]],
  ["source_segment_list", () => [mockProvenanceSegment]],
  ["source_link_create", () => mockSourceLink],
  ["source_link_resolve", () => ({ status: "current", link: mockSourceLink })],
  ["source_link_list_for_anchor", () => [mockSourceLink]],
  ["backlinks_list", () => []],
  ["note_revisions_list", () => []],
  ["note_save", () => ({ revision: 1, contentHash: "content-hash" })],
  ["provenance_backfill", () => ({ schemaVersion: 1, papers: [], totalPapers: 0, createdRevisions: 0 })],
  ["provenance_remap", () => ({ schemaVersion: 1, paperIds: [], linksRecomputed: 0, changed: 0 })],
  ["provenance_export", () => ({ schemaVersion: 1, targetVersion: 1, papers: [] })],
  ["paper_get", () => mockPaper],
  ["paper_quick_read", () => mockQuickReadResult],
  ["paper_find_by_doi", () => mockPaper],
  ["paper_translated_markdown_get", () => null],
  ["paper_translate_markdown_estimate", () => ({
    source_chars: 1200,
    cleaned_chars: 1000,
    chunk_count: 2,
  })],
  ["paper_translate_markdown", () => ({
    markdown: "# 中文译文\n\n这是一段译文。",
    target_lang: "Chinese",
    model: "mock-model",
    prompt_tokens: 0,
    completion_tokens: 0,
    cached: false,
  })],
  ["highlight_update_rect", () => null],
  ["pdf_note_create", () => mockPdfTextNote],
  ["pdf_note_list", () => [mockPdfTextNote]],
  ["pdf_note_update", () => ({ ...mockPdfTextNote, revision: 1 })],
  ["pdf_note_delete", () => null],
  ["pdf_note_search", () => [{ note: mockPdfTextNote, snippet: mockPdfTextNote.content }]],
  ["legacy_reader_notes_preview", () => ({
    schemaVersion: 1,
    targetVersion: 1,
    totalSentinelRows: 0,
    alreadyConverted: 0,
    convertible: 0,
    paperIds: [],
  })],
  ["legacy_reader_notes_export", () => ({
    schemaVersion: 1,
    targetVersion: 1,
    destination: "/tmp/legacy-note-export",
    verifiedBackupPath: "/tmp/legacy-note-export/backup/legacy-notes-0",
    sourceRows: 0,
    converted: 0,
    alreadyConverted: 0,
    failed: 0,
    defaultedStyles: 0,
    markdownFiles: 0,
    sectionFiles: 0,
    emptyDefaultSections: 0,
    rollbackState: "committed",
  })],
  ["paper_supplements_list", () => []],
  ["paper_supplement_add_file", () => ({
    id: 1,
    paper_id: "paper-1",
    title: "supplement.pdf",
    file_path: "/tmp/litfolio-test/papers/paper-1/supplements/supplement.pdf",
    file_kind: "pdf",
    note: "",
    converted_pdf_path: null,
    created_at: now,
    updated_at: now,
  })],
  ["paper_supplement_update_note", () => ({
    id: 1,
    paper_id: "paper-1",
    title: "supplement.pdf",
    file_path: "/tmp/litfolio-test/papers/paper-1/supplements/supplement.pdf",
    file_kind: "pdf",
    note: "note",
    converted_pdf_path: null,
    created_at: now,
    updated_at: now,
  })],
  ["paper_supplement_delete", () => null],
  ["paper_supplement_open", () => null],
  ["paper_supplement_convert_docx_to_pdf", () => ({
    supplement: {
      id: 1,
      paper_id: "paper-1",
      title: "supplement.docx",
      file_path: "/tmp/litfolio-test/papers/paper-1/supplements/supplement.docx",
      file_kind: "docx",
      note: "",
      converted_pdf_path: "/tmp/litfolio-test/papers/paper-1/supplements/supplement.pdf",
      created_at: now,
      updated_at: now,
    },
    pdf_path: "/tmp/litfolio-test/papers/paper-1/supplements/supplement.pdf",
  })],
  ["papers_count", () => 1],
  ["library_root", () => "/tmp/litfolio-test"],
  ["diagnostics_export_log", () => "/tmp/litfolio-diagnostics.log"],
  [
    "sync_get_config",
    () => ({
      webdav: { base_url: "", remote_path: "", username: "", password: "" },
    }),
  ],
  ["sync_save_config", () => null],
  ["sync_test", () => ({ remote_root: mockSyncReport.remote_root })],
  ["sync_preview_push_library", () => mockSyncPreviewReport],
  [
    "sync_preview_pull_library",
    () => {
      const report: SyncPreviewReport = {
        ...mockSyncPreviewReport,
        direction: "pull",
        restart_required: true,
        backup_path: "backups/pre-pull-20260613-litfolio/",
        changes: [
          {
            path: "papers/demo/original.pdf",
            action: "download_new",
            size: 2048,
          },
        ],
      };
      return report;
    },
  ],
  ["sync_push_library", () => mockSyncReport],
  ["sync_pull_library", () => ({ ...mockSyncReport, restart_required: true })],
  ["jobs_list", () => []],
  ["job_create", () => mockJobRecord],
  ["job_start", () => ({ ...mockJobRecord, status: "running" })],
  ["job_update_progress", () => ({ ...mockJobRecord, progress_current: 1, progress_total: 1 })],
  ["job_succeed", () => ({ ...mockJobRecord, status: "succeeded" })],
  ["job_fail", () => ({ ...mockJobRecord, status: "failed", error: "failed" })],
  ["job_cancel", () => ({ ...mockJobRecord, status: "cancelled" })],
  ["job_retry", () => ({ ...mockJobRecord, attempts: 1 })],
  ["folders_list", () => []],
  ["smart_collections_list", () => []],
  ["queue_list", () => []],
  ["queue_add", () => null],
  ["projects_list", () => []],
  ["project_add_paper", () => null],
  ["papers_batch_tags", () => ({})],
  ["ask_capability_state", () => mockAskCapabilityState],
  ["ask_session_latest", () => mockAskSession],
  ["ask_session_save", () => mockAskSession],
  ["llm_get_config", () => mockLlmConfig],
]);

export const registeredMockCommands = [...commandFixtures.keys()].sort();

export function invokeMockCommand<T = unknown>(command: string): T {
  const resolver = commandFixtures.get(command);
  if (!resolver) {
    throw unhandledTauriCommandError(command);
  }
  return resolver() as T;
}

export function unhandledTauriCommandError(command: string): Error {
  return new Error(
    `Unhandled test Tauri command: ${command}. Registered mock commands: ${registeredMockCommands.join(
      ", "
    )}`
  );
}
