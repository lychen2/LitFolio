import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/I18nProvider";
import { LibraryFilterBar } from "./LibraryFilterBar";

describe("LibraryFilterBar", () => {
  it("renders paper filters and collection actions", () => {
    const html = renderToString(
      <I18nProvider lang="zh">
        <LibraryFilterBar
          viewMode="papers"
          search="laser"
          resultLabel="3 results"
          canReviewCollection
          onSearchChange={vi.fn()}
          onClearSearch={vi.fn()}
          onToggleViewMode={vi.fn()}
          onReviewCollection={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(html).toContain("文献库");
    expect(html).toContain("laser");
    expect(html).toContain("3 results");
    expect(html).toContain("文献综述");
  });

  it("hides search while reading queue is active", () => {
    const html = renderToString(
      <I18nProvider lang="zh">
        <LibraryFilterBar
          viewMode="queue"
          search="laser"
          resultLabel=""
          canReviewCollection={false}
          onSearchChange={vi.fn()}
          onClearSearch={vi.fn()}
          onToggleViewMode={vi.fn()}
          onReviewCollection={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(html).toContain("阅读队列");
    expect(html).not.toContain("placeholder=\"搜索标题");
  });
});
