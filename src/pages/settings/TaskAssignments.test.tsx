import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/i18n/I18nProvider";
import type { LlmConfig } from "@/lib/api";
import { TaskAssignments } from "./TaskAssignments";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("TaskAssignments", () => {
  it("shows the profile and model bound to each configured task", () => {
    const html = renderTaskAssignments({
      task_assignments: {
        tldr: { profile: "proxy", model: "gpt-5-mini" },
        quick_read: null,
        translate: null,
        tag: null,
        link: null,
        topic_survey: null,
        ask: null,
        lit_review: { profile: "reviewer", model: null },
      },
    });

    expect(html).toMatch(/proxy[\s\S]*gpt-5-mini/);
    expect(html).toMatch(/reviewer[\s\S]*gpt-4\.1/);
    expect(html).toContain("Literature review");
  });
});

function renderTaskAssignments(overrides: Partial<LlmConfig> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const config: LlmConfig = {
    profiles: [profile("proxy", "gpt-4o-mini"), profile("reviewer", "gpt-4.1")],
    active: "proxy",
    output_language: "Chinese",
    pdf_markdown: { engine: "local", mineru_token: "" },
    obsidian: { vault_dir: "", folder: "Papers" },
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
    ...overrides,
  };
  return renderToString(
    <I18nProvider lang="en">
      <QueryClientProvider client={client}>
        <TaskAssignments draft={config} onChange={() => undefined} />
      </QueryClientProvider>
    </I18nProvider>,
  );
}

function profile(name: string, chat_model: string) {
  return {
    name,
    base_url: "https://example.test/v1",
    api_key: "sk-test",
    chat_model,
    embed_model: null,
    max_tokens: 1024,
    temperature: 0.2,
  };
}
