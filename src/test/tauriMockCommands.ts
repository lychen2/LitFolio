import type { LlmConfig, Paper } from "@/lib/api";

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

type MockResolver = () => unknown;

const commandFixtures = new Map<string, MockResolver>([
  ["papers_recent", () => [mockPaper]],
  ["paper_get", () => mockPaper],
  ["papers_count", () => 1],
  ["library_root", () => "/tmp/litfolio-test"],
  ["sync_get_config", () => ({ webdav: { base_url: "", remote_path: "", username: "", password: "" } })],
  ["folders_list", () => []],
  ["smart_collections_list", () => []],
  ["queue_list", () => []],
  ["projects_list", () => []],
  ["papers_batch_tags", () => ({})],
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
    `Unhandled test Tauri command: ${command}. Registered mock commands: ${registeredMockCommands.join(", ")}`
  );
}
