import { describe, expect, it } from "vitest";

import { detectSourceKind } from "./ArxivDoiWorkflow";

describe("detectSourceKind", () => {
  it("detects arXiv identifiers and URLs", () => {
    expect(detectSourceKind("2401.12345")).toBe("arxiv");
    expect(detectSourceKind("arXiv:2401.12345")).toBe("arxiv");
    expect(detectSourceKind("https://arxiv.org/abs/2401.12345")).toBe("arxiv");
  });

  it("detects DOI values and URLs", () => {
    expect(detectSourceKind("10.1145/1234567")).toBe("doi");
    expect(detectSourceKind("https://doi.org/10.1145/1234567")).toBe("doi");
  });

  it("returns null for unsupported import input", () => {
    expect(detectSourceKind("not an identifier")).toBeNull();
  });
});
