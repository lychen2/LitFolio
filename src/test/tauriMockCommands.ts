import type { AskCapabilityState, AskSession, JobRecord, LlmConfig, Paper, QuickReadResult } from "@/lib/api";
import type { SyncPreviewReport, SyncReport } from "@/lib/syncApi";

const now = 1_779_999_999;

export const mockPaper: Paper = {
  id: "paper-1",
  title: "Browser Smoke Paper",
  authors: ["Ada Lovelace"],
  year: 2026,
  venue: "LitFolio E2E",
  doi: null,
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
  },
  output_language: "Chinese",
  pdf_markdown: { engine: "local", mineru_token: "" },
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

type MockResolver = () => unknown;

const commandFixtures = new Map<string, MockResolver>([
  ["papers_recent", () => [mockPaper]],
  ["paper_get", () => mockPaper],
  ["paper_quick_read", () => mockQuickReadResult],
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
