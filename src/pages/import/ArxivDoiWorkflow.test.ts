import { describe, expect, it } from "vitest";

import { detectSourceKind, formatAutoDownloadError } from "./ArxivDoiWorkflow";
import { type useT } from "@/i18n/I18nProvider";

const t: ReturnType<typeof useT> = (key, vars) => (vars?.detail ? `${key}: ${vars.detail}` : key);

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

describe("formatAutoDownloadError", () => {
  it("maps DOI missing public PDF links to an explicit user prompt", () => {
    expect(
      formatAutoDownloadError(
        "DOI_AUTO_DOWNLOAD_NO_PUBLIC_PDF: CrossRef did not declare any public PDF link",
        "doi",
        t,
      ),
    ).toBe("import.error.doiNoPublicPdf");
  });

  it("keeps failed DOI PDF attempt details visible", () => {
    expect(
      formatAutoDownloadError(
        "DOI_AUTO_DOWNLOAD_PUBLIC_PDF_FAILED: candidate returned text/html",
        "doi",
        t,
      ),
    ).toBe("import.error.doiPublicPdfFailed: candidate returned text/html");
  });

  it("keeps all DOI auto-download failure details visible", () => {
    expect(
      formatAutoDownloadError(
        "DOI_AUTO_DOWNLOAD_ALL_FAILED: Sci-Hub timeout; CrossRef 403",
        "doi",
        t,
      ),
    ).toBe("import.error.doiAllMethodsFailed: Sci-Hub timeout; CrossRef 403");
  });

  it("leaves unknown DOI auto-download errors unchanged", () => {
    expect(
      formatAutoDownloadError(
        "DOI_AUTO_DOWNLOAD_VENDOR_TIMEOUT: upstream timed out",
        "doi",
        t,
      ),
    ).toBe("DOI_AUTO_DOWNLOAD_VENDOR_TIMEOUT: upstream timed out");
  });

  it("leaves arXiv download errors unchanged", () => {
    expect(formatAutoDownloadError("failed to download arXiv PDF", "arxiv", t)).toBe(
      "failed to download arXiv PDF",
    );
  });
});
