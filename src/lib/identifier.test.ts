import { describe, expect, it } from "vitest";
import { extractIdentifier, extractSourceIdentifier } from "./identifier";

describe("extractSourceIdentifier", () => {
  it("extracts arXiv identifiers from common arxiv URLs", () => {
    expect(extractSourceIdentifier("https://arxiv.org/abs/2401.01234v2").arxivId).toBe("2401.01234");
    expect(extractSourceIdentifier("https://arxiv.org/pdf/2401.01234.pdf").arxivId).toBe("2401.01234");
    expect(extractIdentifier("https://arxiv.org/html/2401.01234?context=cs")).toBe("2401.01234");
  });

  it("extracts DOI values without query fragments", () => {
    expect(extractSourceIdentifier("https://doi.org/10.1364/OPTICA.123456?x=1").doi).toBe("10.1364/OPTICA.123456");
    expect(extractIdentifier("https://doi.org/10.1145/1234567#section")).toBe("10.1145/1234567");
  });

  it("returns nulls for unrelated links", () => {
    expect(extractSourceIdentifier("https://example.com/paper")).toEqual({ arxivId: null, doi: null });
    expect(extractIdentifier("https://example.com/paper")).toBeNull();
  });
});
