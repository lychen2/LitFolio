import { describe, expect, it } from "vitest";
import { doiOfficialUrl } from "./DoiEnrichRow";

describe("doiOfficialUrl", () => {
  it("builds a doi.org URL from a bare DOI", () => {
    expect(doiOfficialUrl("10.1145/3530819")).toBe("https://doi.org/10.1145/3530819");
  });

  it("normalizes doi prefixes and existing doi.org URLs", () => {
    expect(doiOfficialUrl("doi: 10.1000/ABC DEF")).toBe("https://doi.org/10.1000/ABC%20DEF");
    expect(doiOfficialUrl("https://dx.doi.org/10.5555/12345678")).toBe("https://doi.org/10.5555/12345678");
  });

  it("omits the official link for empty DOI values", () => {
    expect(doiOfficialUrl("   ")).toBeNull();
    expect(doiOfficialUrl(null)).toBeNull();
  });
});
