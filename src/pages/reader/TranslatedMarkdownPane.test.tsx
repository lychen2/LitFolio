import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/i18n/I18nProvider";
import {
  TranslatedMarkdownPane,
  errorMessage,
  readingOriginalMarkdownQueryKey,
  translatedMarkdownEstimateQueryKey,
  translatedMarkdownQueryKey,
  type ReadingDocMode,
} from "./TranslatedMarkdownPane";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve(null)),
}));

const SOURCE_MARKDOWN = [
  "<!-- page:1 -->",
  "# Attention Is All You Need",
  "",
  "<!-- page:2 -->",
  "The model uses 8 attention heads.",
].join("\n");

const TRANSLATED_MARKDOWN = ["# 注意力就是你所需要的一切", "该模型使用 8 个注意力头。"].join("\n");

describe("TranslatedMarkdownPane", () => {
  it("offers the PDF source when no local text can be extracted", () => {
    const html = renderPane({ onOpenPdf: vi.fn() });

    expect(html).toContain("母语阅读");
    expect(html).toContain("PDF 原文");
    expect(html).not.toContain("生成全文译文");
  });

  it("shows the estimated full-translation chunk count before generation", () => {
    const html = renderPane({ originalMarkdown: SOURCE_MARKDOWN, estimatedChunks: 2 });

    expect(html).toContain("预计将发送 2 段文本");
    expect(html).toContain("生成全文译文");
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

  it("offers translated, original and side-by-side reading views", () => {
    const html = renderPane({ cachedMarkdown: TRANSLATED_MARKDOWN, originalMarkdown: SOURCE_MARKDOWN });

    expect(html).toContain(">译文<");
    expect(html).toContain(">原文<");
    expect(html).toContain(">对照<");
  });

  it("shows the source text in original mode without the translation", () => {
    const html = renderPane({
      cachedMarkdown: TRANSLATED_MARKDOWN,
      originalMarkdown: SOURCE_MARKDOWN,
      initialMode: "original",
    });

    expect(html).toContain("The model uses 8 attention heads.");
    expect(html).not.toContain("该模型使用 8 个注意力头");
  });

  it("renders page markers from cached source text in original mode", () => {
    const html = renderPane({
      cachedMarkdown: TRANSLATED_MARKDOWN,
      originalMarkdown: SOURCE_MARKDOWN,
      initialMode: "original",
    });

    expect(html).toContain("第 1 页");
    expect(html).toContain("第 2 页");
  });

  it("makes page markers jump to the PDF when the parent supplies a handler", () => {
    const html = renderPane({
      cachedMarkdown: TRANSLATED_MARKDOWN,
      originalMarkdown: SOURCE_MARKDOWN,
      initialMode: "original",
      onOpenPdfPage: vi.fn(),
    });

    expect(html).toContain("在 PDF 中打开第 2 页");
  });

  it("shows both complete documents without pairing unrelated paragraphs", () => {
    const html = renderPane({
      cachedMarkdown: "# 标题\n\n合并后的译文。",
      originalMarkdown: "# Title\n\nFirst paragraph.\n\nSecond paragraph.",
      initialMode: "bilingual",
    });

    expect(html).toContain("First paragraph.");
    expect(html).toContain("Second paragraph.");
    expect(html).toContain("合并后的译文。");
    expect(html).toContain("litera-reading-bilingual-column");
    expect(html).not.toContain("litera-reading-pair");
  });

  it("keeps the translation readable when the local PDF has no extractable text", () => {
    const html = renderPane({ cachedMarkdown: TRANSLATED_MARKDOWN });

    expect(html).toContain("该模型使用 8 个注意力头。");
    expect(html).toContain("disabled");
  });

  it("exposes the PDF comparison toggle to the parent", () => {
    const html = renderPane({ cachedMarkdown: TRANSLATED_MARKDOWN, onTogglePdfComparison: vi.fn(), pdfComparisonActive: true });

    expect(html).toContain("与 PDF 对照");
    expect(html).toContain('aria-pressed="true"');
  });

  it("formats concrete AI request errors for display", () => {
    expect(errorMessage(new Error("LLM endpoint returned 500: bad gateway"))).toBe(
      "LLM endpoint returned 500: bad gateway",
    );
    expect(errorMessage("network down")).toBe("network down");
  });

  it("keys cached translations by paper and language", () => {
    expect(translatedMarkdownQueryKey("p1", "Chinese")).toEqual(["paperTranslatedMarkdown", "p1", "Chinese"]);
    expect(readingOriginalMarkdownQueryKey("p1")).toEqual(["paperMarkdown", "p1"]);
  });
});

function renderPane(
  options: {
    paperTitle?: string;
    cachedMarkdown?: string;
    originalMarkdown?: string;
    estimatedChunks?: number;
    cachedError?: string;
    initialMode?: ReadingDocMode;
    onOpenPdfPage?: (page: number) => void;
    onTogglePdfComparison?: () => void;
    pdfComparisonActive?: boolean;
    onOpenPdf?: () => void;
  } = {},
) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  client.setQueryData(translatedMarkdownQueryKey("paper-1", "Chinese"), options.cachedMarkdown
    ? {
        markdown: options.cachedMarkdown,
        target_lang: "Chinese",
        model: "mock-model",
        prompt_tokens: 0,
        completion_tokens: 0,
        cached: true,
      }
    : null);
  client.setQueryData(
    readingOriginalMarkdownQueryKey("paper-1"),
    options.originalMarkdown ?? null,
  );
  if (options.estimatedChunks !== undefined) {
    client.setQueryData(translatedMarkdownEstimateQueryKey("paper-1"), {
      source_chars: 1200,
      cleaned_chars: 1000,
      chunk_count: options.estimatedChunks,
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
  return renderToString(
    <I18nProvider lang="zh">
      <QueryClientProvider client={client}>
        <TranslatedMarkdownPane
          paperId="paper-1"
          paperTitle={options.paperTitle}
          mode={options.initialMode ?? "translated"}
          onModeChange={() => undefined}
          onOpenPdfPage={options.onOpenPdfPage}
          onTogglePdfComparison={options.onTogglePdfComparison}
          pdfComparisonActive={options.pdfComparisonActive}
          onOpenPdf={options.onOpenPdf}
        />
      </QueryClientProvider>
    </I18nProvider>,
  );
}
