import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/i18n/I18nProvider";
import { TranslatedMarkdownPane, errorMessage, translatedMarkdownEstimateQueryKey, translatedMarkdownQueryKey } from "./TranslatedMarkdownPane";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve(null)),
}));

describe("TranslatedMarkdownPane", () => {
  it("opens with the native reading call to action", () => {
    const html = renderPane();

    expect(html).toContain("母语阅读");
    expect(html).toContain("生成全文译文");
  });

  it("shows the estimated full-translation chunk count before generation", () => {
    const html = renderPane({ estimatedChunks: 2 });

    expect(html).toContain("预计将发送 2 段文本");
  });

  it("renders cached translated markdown with paper title and language", () => {
    const html = renderPane({
      paperTitle: "Graph Paper",
      cachedMarkdown: "# 中文标题\n\n译文正文",
    });

    expect(html).toContain("Graph Paper");
    expect(html).toContain("已缓存 Chinese 译文");
    expect(html).toContain("中文标题");
    expect(html).toContain("重新翻译");
  });

  it("formats concrete AI request errors for display", () => {
    expect(errorMessage(new Error("LLM endpoint returned 500: bad gateway"))).toBe(
      "LLM endpoint returned 500: bad gateway"
    );
    expect(errorMessage("network down")).toBe("network down");
  });

  it("keys cached translations by paper and language", () => {
    expect(translatedMarkdownQueryKey("p1", "Chinese")).toEqual([
      "paperTranslatedMarkdown",
      "p1",
      "Chinese",
    ]);
  });
});
function renderPane(options: { paperTitle?: string; cachedMarkdown?: string; estimatedChunks?: number; cachedError?: string } = {}) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  if (options.cachedMarkdown) {
    client.setQueryData(translatedMarkdownQueryKey("paper-1", "Chinese"), {
      markdown: options.cachedMarkdown,
      target_lang: "Chinese",
      model: "mock-model",
      prompt_tokens: 0,
      completion_tokens: 0,
      cached: true,
    });
  }
  if (options.cachedError) {
    const query = client.getQueryCache().build(client, {
      queryKey: translatedMarkdownQueryKey("paper-1", "Chinese"),
      queryFn: () => Promise.resolve(null),
    });
    query.setState({
      data: undefined,
      dataUpdateCount: 0,
      dataUpdatedAt: 0,
      error: new Error(options.cachedError),
      errorUpdateCount: 1,
      errorUpdatedAt: Date.now(),
      fetchFailureCount: 1,
      fetchFailureReason: new Error(options.cachedError),
      fetchMeta: null,
      isInvalidated: false,
      status: "error",
      fetchStatus: "idle",
    });
  }
  if (options.estimatedChunks !== undefined) {
    client.setQueryData(translatedMarkdownQueryKey("paper-1", "Chinese"), null);
    client.setQueryData(translatedMarkdownEstimateQueryKey("paper-1"), {
      source_chars: 1200,
      cleaned_chars: 1000,
      chunk_count: options.estimatedChunks,
    });
  }
  return renderToString(
    <I18nProvider lang="zh">
      <QueryClientProvider client={client}>
        <TranslatedMarkdownPane paperId="paper-1" paperTitle={options.paperTitle} />
      </QueryClientProvider>
    </I18nProvider>,
  );
}
