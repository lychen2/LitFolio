import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { I18nProvider } from "@/i18n/I18nProvider";
import type { JobRecord } from "@/lib/api";

import {
  IMPORT_JOBS_CHANGED_EVENT,
  clearResolvedImportJobs,
  duplicateStatusFromError,
  duplicateStatusFromFailures,
  formatPdfImportError,
  importJobId,
  mergeImportJob,
  pdfStatusFromPaper,
  readImportJobs,
  subtitleFromDraft,
  titleFromDraft,
  upsertImportJob,
  type ImportJob,
} from "./importJobs";
import { ImportJobInbox, mergeInboxItems } from "./ImportJobInbox";

const STORAGE_KEY = "litera.import.jobs";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("import job helpers", () => {
  it("normalizes stable job ids", () => {
    expect(importJobId("doi", " 10.1145/ABC DEF? ")).toBe("doi:10.1145-abc-def");
    expect(importJobId("pdf", " !!! ")).toBe("pdf:unknown");
  });

  it("merges patches newest-first while preserving createdAt", () => {
    const existing = job({ id: "pdf:a", status: "running", createdAt: 10, updatedAt: 20 });

    const merged = mergeImportJob(
      [existing, job({ id: "doi:b", updatedAt: 30 })],
      {
        id: "pdf:a",
        source: "pdf",
        title: "Updated PDF",
        status: "completed",
        metadataStatus: "completed",
        pdfStatus: "completed",
        duplicateStatus: "clear",
      },
      40
    );

    expect(merged[0]).toMatchObject({
      id: "pdf:a",
      title: "Updated PDF",
      status: "completed",
      metadataStatus: "completed",
      pdfStatus: "completed",
      duplicateStatus: "clear",
      createdAt: 10,
      updatedAt: 40,
    });
    expect(merged).toHaveLength(2);
  });

  it("keeps only the latest 30 jobs", () => {
    const jobs = Array.from({ length: 31 }, (_, index) =>
      job({ id: `pdf:${index}`, title: `PDF ${index}`, updatedAt: index })
    );

    const merged = mergeImportJob(
      jobs,
      { id: "pdf:new", source: "pdf", title: "Newest" },
      100
    );

    expect(merged).toHaveLength(30);
    expect(merged[0]?.id).toBe("pdf:new");
    expect(merged.some((item) => item.id === "pdf:0")).toBe(false);
  });

  it("derives duplicate, title, subtitle, and PDF step statuses", () => {
    expect(duplicateStatusFromError("already imported duplicate record")).toBe("duplicate");
    expect(duplicateStatusFromError("network timeout")).toBe("unknown");
    expect(duplicateStatusFromFailures([{ error: "重复导入" }])).toBe("duplicate");
    expect(duplicateStatusFromFailures([])).toBe("clear");
    expect(titleFromDraft({ title: " Paper title " }, "Fallback")).toBe("Paper title");
    expect(titleFromDraft(null, "Fallback")).toBe("Fallback");
    expect(
      subtitleFromDraft({
        arxiv_id: "2401.01234",
        doi: "10.123/test",
        venue: "Venue",
        year: 2026,
      })
    ).toBe("arXiv:2401.01234 · doi:10.123/test · Venue · 2026");
    expect(pdfStatusFromPaper({ title: "x", pdf_path: "/tmp/p.pdf" })).toBe("completed");
    expect(pdfStatusFromPaper({ title: "x", pdf_path: null })).toBe("missing");
  });

  it("maps backend PDF import errors to readable messages", () => {
    const t = (key: string) => key;

    expect(formatPdfImportError("/tmp/a.txt does not start with the %PDF- header", t)).toBe(
      "import.error.pdfInvalid"
    );
    expect(formatPdfImportError("only .pdf files are accepted (got .txt)", t)).toBe(
      "import.error.pdfWrongExtension"
    );
    expect(formatPdfImportError("PDF source /library/papers/x.pdf is already inside the library; pick an external file", t)).toBe(
      "import.error.pdfInsideLibrary"
    );
  });
});

describe("import inbox merging", () => {
  it("keeps newest local and persisted jobs together", () => {
    const local = job({ id: "pdf:local", updatedAt: 30 });
    const persisted = { ...persistedJob(), id: "job-1", updated_at: 40 };
    const merged = mergeInboxItems([local], [persisted]);

    expect(merged.map((item) => item.kind)).toEqual(["persisted", "local"]);
    expect(merged[0]?.updatedAt).toBe(40);
    expect(merged[1]?.updatedAt).toBe(30);
  });

  it("renders failed local jobs with failed steps, progress, and error", () => {
    installWindowMock([
      job({
        id: "pdf:failed",
        source: "pdf",
        title: "Broken PDF",
        status: "failed",
        metadataStatus: "failed",
        pdfStatus: "failed",
        duplicateStatus: "unknown",
        error: "Only .pdf files are accepted.",
        progress: { done: 0, total: 1, failed: 1 },
      }),
    ]);

    const html = renderImportJobInbox();

    expect(html).toContain("Broken PDF");
    expect(html).toContain("失败");
    expect(html).toContain("0/1");
    expect(html).toContain("1 失败");
    expect(html).toContain("Only .pdf files are accepted.");
  });

  it("does not count failed local jobs as active", () => {
    installWindowMock([
      job({ id: "pdf:failed", status: "failed" }),
      job({ id: "doi:running", source: "doi", status: "running" }),
    ]);

    const html = renderImportJobInbox();

    expect(html).toContain("共 2 个");
    expect(html).toContain("1 个进行中");
  });
});

function renderImportJobInbox() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return renderToString(
    createElement(
      I18nProvider,
      { lang: "zh", children: null },
      createElement(
        QueryClientProvider,
        { client },
        createElement(ImportJobInbox)
      )
    )
  );
}

describe("import job storage", () => {
  it("upserts jobs into localStorage and dispatches change events", () => {
    const windowMock = installWindowMock();

    upsertImportJob({
      id: "search:paper",
      source: "search",
      title: "Search paper",
      status: "running",
      metadataStatus: "completed",
      pdfStatus: "running",
      duplicateStatus: "checking",
    });

    expect(readImportJobs()).toMatchObject([
      {
        id: "search:paper",
        source: "search",
        title: "Search paper",
        status: "running",
      },
    ]);
    expect(windowMock.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: IMPORT_JOBS_CHANGED_EVENT })
    );
  });

  it("clears only completed and failed jobs", () => {
    installWindowMock([
      job({ id: "pdf:done", status: "completed" }),
      job({ id: "doi:failed", source: "doi", status: "failed" }),
      job({ id: "rss:waiting", source: "rss", status: "waiting" }),
    ]);

    clearResolvedImportJobs();

    expect(readImportJobs().map((item) => item.id)).toEqual(["rss:waiting"]);
  });

  it("ignores malformed localStorage payloads", () => {
    installWindowMock();
    window.localStorage.setItem(STORAGE_KEY, "not-json");

    expect(readImportJobs()).toEqual([]);
  });
});

function job(overrides: Partial<ImportJob> = {}): ImportJob {
  return {
    id: "pdf:paper",
    source: "pdf",
    title: "Paper",
    status: "queued",
    metadataStatus: "unknown",
    pdfStatus: "unknown",
    duplicateStatus: "unknown",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function persistedJob(): JobRecord {
  return {
    id: "job-0",
    kind: "candidate_batch_import",
    scope: "candidate_inbox",
    title: "Import candidates",
    status: "queued",
    details: {},
    progress_current: 0,
    progress_total: 0,
    error: null,
    attempts: 0,
    max_attempts: 1,
    created_at: 1,
    updated_at: 1,
    started_at: null,
    finished_at: null,
  };
}

function installWindowMock(seed: ImportJob[] = []) {
  const storage = new Map<string, string>();
  if (seed.length > 0) {
    storage.set(STORAGE_KEY, JSON.stringify(seed));
  }

  const windowMock = {
    localStorage: {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        storage.set(key, value);
      }),
    },
    dispatchEvent: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };

  vi.stubGlobal("window", windowMock);
  return windowMock;
}
