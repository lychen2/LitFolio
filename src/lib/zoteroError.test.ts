import { describe, expect, it } from "vitest";
import { zoteroErrorMessage } from "./zoteroError";

const t = ((key: string, vars?: Record<string, string | number>) =>
  key === "library.zoteroError.generic" ? `generic:${vars?.message}` : key) as Parameters<
  typeof zoteroErrorMessage
>[1];

describe("zoteroErrorMessage", () => {
  it("maps not-configured errors", () => {
    expect(zoteroErrorMessage(new Error("Zotero target collection is not configured"), t)).toBe(
      "library.zoteroError.notConfigured",
    );
  });

  it("maps unreachable Zotero", () => {
    expect(
      zoteroErrorMessage(
        new Error("Zotero connector request failed (is Zotero desktop running?)"),
        t,
      ),
    ).toBe("library.zoteroError.unreachable");
  });

  it("falls back to generic with original message", () => {
    expect(zoteroErrorMessage(new Error("saveItems failed: 500"), t)).toBe(
      "generic:saveItems failed: 500",
    );
  });
});
