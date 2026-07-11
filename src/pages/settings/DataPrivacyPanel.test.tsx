import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/i18n/I18nProvider";
import { DataPrivacyPanel } from "./DataPrivacyPanel";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ revealItemInDir: vi.fn() }));

describe("DataPrivacyPanel", () => {
  it("explains what AI requests send", () => {
    const html = renderPrivacyPanel();

    expect(html).toContain("Export diagnostics log");
    expect(html).toContain("Data sent by AI requests");
    expect(html).toContain("Translation sends the selected text");
    expect(html).toContain("Library Q&amp;A sends the question");
    expect(html).toContain("Topic and literature review send the topic");
  });
});

function renderPrivacyPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return renderToString(
    <I18nProvider lang="en">
      <QueryClientProvider client={client}>
        <DataPrivacyPanel />
      </QueryClientProvider>
    </I18nProvider>,
  );
}
