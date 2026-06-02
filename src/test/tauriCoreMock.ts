import type { LlmConfig, Paper } from "@/lib/api";

const now = 1_779_999_999;

const paper: Paper = {
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

const llmConfig: LlmConfig = {
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
};

export class Channel<T = unknown> {
  readonly id = 0;
  onmessage: (response: T) => void;

  constructor(onmessage: (response: T) => void = () => undefined) {
    this.onmessage = onmessage;
  }

  toJSON(): string {
    return String(this.id);
  }
}

export class Resource {
  readonly rid: number;

  constructor(rid: number) {
    this.rid = rid;
  }

  async close(): Promise<void> {
    return undefined;
  }
}

export function transformCallback(): number {
  return 0;
}

export function convertFileSrc(path: string): string {
  return path;
}

export function isTauri(): boolean {
  return false;
}

export async function invoke<T>(command: string, _args?: unknown): Promise<T> {
  switch (command) {
    case "papers_recent":
      return [paper] as T;
    case "paper_get":
      return paper as T;
    case "papers_count":
      return 1 as T;
    case "library_root":
      return "/tmp/litfolio-test" as T;
    case "sync_get_config":
      return { webdav: { base_url: "", remote_path: "", username: "", password: "" } } as T;
    case "folders_list":
    case "smart_collections_list":
    case "reading_queue_list":
    case "projects_list":
      return [] as T;
    case "papers_batch_tags":
      return {} as T;
    case "llm_get_config":
      return llmConfig as T;
    default:
      throw new Error(`Unhandled E2E Tauri command: ${command}`);
  }
}
