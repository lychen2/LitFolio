import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/I18nProvider";
import { SaveStatus } from "./NotesPane";

describe("SaveStatus", () => {
  it("shows retry when saving a note fails", () => {
    const html = renderToString(
      <I18nProvider lang="zh">
        <SaveStatus status="dirty" error={new Error("disk full")} onRetry={vi.fn()} />
      </I18nProvider>,
    );

    expect(html).toContain("保存失败");
    expect(html).toContain("disk full");
    expect(html).toContain("重试");
  });
});
