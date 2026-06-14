import { describe, expect, it } from "vitest";

import {
  detectSourceKind,
  formatAutoDownloadError,
  parseAutoDownloadFailure,
} from "./ArxivDoiWorkflow";
import { type useT } from "@/i18n/I18nProvider";

const t: ReturnType<typeof useT> = (key, vars) =>
  vars?.detail ? `${key}: ${vars.detail}` : key;

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
        t
      )
    ).toBe("import.error.doiNoPublicPdf");
  });

  it("keeps failed DOI PDF attempt details visible", () => {
    expect(
      formatAutoDownloadError(
        "DOI_AUTO_DOWNLOAD_PUBLIC_PDF_FAILED: candidate returned text/html",
        "doi",
        t
      )
    ).toBe("import.error.doiPublicPdfFailed: candidate returned text/html");
  });

  it("keeps all DOI auto-download failure details visible", () => {
    expect(
      formatAutoDownloadError(
        "DOI_AUTO_DOWNLOAD_ALL_FAILED: Sci-Hub timeout; CrossRef 403",
        "doi",
        t
      )
    ).toBe("import.error.doiAllMethodsFailed: Sci-Hub timeout; CrossRef 403");
  });

  it("leaves unknown DOI auto-download errors unchanged", () => {
    expect(
      formatAutoDownloadError(
        "DOI_AUTO_DOWNLOAD_VENDOR_TIMEOUT: upstream timed out",
        "doi",
        t
      )
    ).toBe("DOI_AUTO_DOWNLOAD_VENDOR_TIMEOUT: upstream timed out");
  });

  it("leaves arXiv download errors unchanged", () => {
    expect(
      formatAutoDownloadError("failed to download arXiv PDF", "arxiv", t)
    ).toBe("failed to download arXiv PDF");
  });
});

describe("parseAutoDownloadFailure", () => {
  it("parses DOI source decisions with evidence URLs and normalized reasons", () => {
    const failure = parseAutoDownloadFailure(
      "DOI_AUTO_DOWNLOAD_PUBLIC_PDF_FAILED: both Sci-Hub and CrossRef failed for DOI 10.123/example. Select a local PDF manually. Details: Sci-Hub download(https://sci-hub.st/10.123/example): response is not a valid PDF; CrossRef(https://publisher.test/paper.pdf): expected PDF",
      "doi"
    );

    expect(failure?.code).toBe("DOI_AUTO_DOWNLOAD_PUBLIC_PDF_FAILED");
    expect(failure?.decisions).toEqual([
      {
        source: "scihub",
        status: "failed",
        evidenceUrl: "https://sci-hub.st/10.123/example",
        reason: "response is not a valid PDF",
      },
      {
        source: "crossref",
        status: "failed",
        evidenceUrl: "https://publisher.test/paper.pdf",
        reason: "expected PDF",
      },
    ]);
  });

  it("marks DOI sources as not found when no PDF URL is available", () => {
    const failure = parseAutoDownloadFailure(
      "DOI_AUTO_DOWNLOAD_NO_PUBLIC_PDF: both Sci-Hub and CrossRef failed for DOI 10.123/example. Select a local PDF manually. Details: Sci-Hub: no PDF URL resolved for this DOI; CrossRef: no public PDF link declared",
      "doi"
    );

    expect(failure?.decisions).toEqual([
      {
        source: "scihub",
        status: "not_found",
        evidenceUrl: null,
        reason: "no PDF URL resolved for this DOI",
      },
      {
        source: "crossref",
        status: "not_found",
        evidenceUrl: null,
        reason: "no public PDF link declared",
      },
    ]);
  });

  it("parses arXiv failures as a single source decision", () => {
    const failure = parseAutoDownloadFailure(
      "failed to download arXiv PDF from https://arxiv.org/pdf/2401.12345",
      "arxiv"
    );

    expect(failure?.decisions).toEqual([
      {
        source: "arxiv",
        status: "failed",
        evidenceUrl: "https://arxiv.org/pdf/2401.12345",
        reason:
          "failed to download arXiv PDF from https://arxiv.org/pdf/2401.12345",
      },
    ]);
  });

  it("ignores blank failure messages", () => {
    expect(parseAutoDownloadFailure("  ", "doi")).toBeNull();
  });
});
