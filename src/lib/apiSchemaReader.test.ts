import { describe, expect, it } from "vitest";

import { parsePdfTextNote, parseReaderAnnotation } from "./apiSchemaReader";

const validNote = {
  kind: "text-note",
  id: "note-1",
  paperId: "paper-1",
  rect: { page: 1, x: 20, y: 30, width: 220, height: 120 },
  content: "Draft",
  color: "#fff3a3",
  fontSize: 12,
  opacity: 0.9,
  revision: 2,
  createdAt: 10,
  updatedAt: 20,
};

describe("Reader annotation API parsers", () => {
  it("parses a text note and preserves its discriminant", () => {
    expect(parseReaderAnnotation(validNote)).toEqual(validNote);
  });

  it("parses a highlight with optional linked note text", () => {
    expect(parseReaderAnnotation({
      kind: "highlight",
      id: "highlight-1",
      paperId: "paper-1",
      page: 1,
      rect: { rects: [] },
      selectedText: "Selection",
      color: "yellow",
      note: "Linked note",
    }).kind).toBe("highlight");
  });

  it("rejects invalid geometry with a precise path", () => {
    expect(() => parsePdfTextNote({
      ...validNote,
      rect: { ...validNote.rect, width: 0 },
    }, "pdf_note_list[0]")).toThrow("pdf_note_list[0].rect");
  });

  it("rejects invalid style bounds", () => {
    expect(() => parsePdfTextNote({ ...validNote, opacity: 2 }, "pdf_note_create"))
      .toThrow("pdf_note_create");
    expect(() => parsePdfTextNote({ ...validNote, color: "yellow" }, "pdf_note_create"))
      .toThrow("pdf_note_create");
  });

  it("rejects missing and malformed fields", () => {
    const missing = { ...validNote } as Record<string, unknown>;
    delete missing.content;
    expect(() => parsePdfTextNote(missing)).toThrow("PdfTextNote.content");
    expect(() => parsePdfTextNote({ ...validNote, revision: 1.5 })).toThrow("PdfTextNote.revision");
  });
});
