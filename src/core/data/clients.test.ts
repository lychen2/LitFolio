import { describe, expect, it } from "vitest";

import { api } from "@/lib/api";
import { aiReaderApi } from "@/lib/apiAiReader";
import { knowledgeApi } from "@/lib/apiKnowledge";
import { libraryApi } from "@/lib/apiLibrary";
import { aiReadingClient, libraryClient, readerClient } from "./index";

describe("core data compatibility clients", () => {
  it("delegates library and AI Reading calls to the existing typed owners", () => {
    expect(libraryClient).toBe(libraryApi);
    expect(aiReadingClient).toBe(aiReaderApi);
    expect(api.paperGet).toBe(libraryClient.paperGet);
    expect(api.paperTldr).toBe(aiReadingClient.paperTldr);
  });

  it("exposes Reader document and annotation operations without wrappers", () => {
    expect(readerClient.highlightList).toBe(aiReaderApi.highlightList);
    expect(readerClient.noteSave).toBe(aiReaderApi.noteSave);
    expect(readerClient.noteSectionsGet).toBe(knowledgeApi.noteSectionsGet);
    expect(api.highlightList).toBe(readerClient.highlightList);
    expect(api.noteSectionsGet).toBe(readerClient.noteSectionsGet);
  });

  it("exposes legacy margin-note conversion and archive export operations", () => {
    expect(typeof readerClient.pdfNoteCreate).toBe("function");
    expect(typeof readerClient.pdfNoteUpdate).toBe("function");
    expect(typeof readerClient.pdfNoteDelete).toBe("function");
    expect(typeof readerClient.pdfNoteSearch).toBe("function");
    expect(typeof readerClient.legacyReaderNotesPreview).toBe("function");
    expect(typeof readerClient.legacyReaderNotesExport).toBe("function");
  });

  it("loads clients before the compatibility module without a cycle", async () => {
    const core = await import("./index");
    const compatibility = await import("@/lib/api");

    expect(compatibility.api.paperGet).toBe(core.libraryClient.paperGet);
    expect(compatibility.api.highlightList).toBe(core.readerClient.highlightList);
    expect(compatibility.api.paperTldr).toBe(core.aiReadingClient.paperTldr);
  });
});
