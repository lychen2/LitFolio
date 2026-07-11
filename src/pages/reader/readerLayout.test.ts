import { describe, expect, it } from "vitest";
import { READER_COMPACT_TITLE_CLASS } from "./readerLayout";

describe("READER_COMPACT_TITLE_CLASS", () => {
  it("keeps compact reader titles truncating instead of pushing icon-only controls", () => {
    expect(READER_COMPACT_TITLE_CLASS).toContain("min-w-0");
    expect(READER_COMPACT_TITLE_CLASS).toContain("flex-1");
    expect(READER_COMPACT_TITLE_CLASS).toContain("truncate");
  });
});
