import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/I18nProvider";
import { SmartCollectionEditor } from "./SmartCollectionEditor";

describe("SmartCollectionEditor", () => {
  it("shows invalid rule warnings before saving", () => {
    const html = renderToString(
      <I18nProvider lang="zh">
        <SmartCollectionEditor
          initialName="Broken collection"
          initialRules={{
            type: "group",
            combinator: "and",
            rules: [{ type: "condition", field: "title", operator: "contains", value: "" }],
          }}
          onSave={vi.fn()}
          onCancel={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(html).toContain("规则值不能为空");
    expect(html).toContain("disabled");
  });
});
