import { describe, expect, it } from "vitest";
import { citationExportFormats } from "./ExportCitationsDialog";

describe("citationExportFormats", () => {
  it("supports BibTeX, RIS, APA, and IEEE exports", () => {
    expect(citationExportFormats.map((format) => format.value)).toEqual(
      expect.arrayContaining(["bibtex", "ris", "apa", "ieee"]),
    );
    expect(citationExportFormats.find((format) => format.value === "bibtex")?.ext).toBe("bib");
    expect(citationExportFormats.find((format) => format.value === "ris")?.ext).toBe("ris");
  });
});
