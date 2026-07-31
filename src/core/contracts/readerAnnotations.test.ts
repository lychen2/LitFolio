import { describe, expect, it } from "vitest";

import {
  isPdfTextNote,
  isValidPdfAnnotationRect,
  isValidPdfTextNoteStyle,
  type ReaderAnnotation,
} from "./readerAnnotations";

describe("Reader annotation contracts", () => {
  it("narrows the discriminated union without consulting highlight labels", () => {
    const annotations: ReaderAnnotation[] = [
      {
        kind: "highlight",
        id: "highlight-1",
        paperId: "paper-1",
        page: 1,
        rect: {},
        selectedText: "Selected text",
        color: "yellow",
        note: "Linked note",
      },
      {
        kind: "text-note",
        id: "note-1",
        paperId: "paper-1",
        rect: { page: 1, x: 10, y: 20, width: 120, height: 80 },
        content: "Standalone note",
        color: "#fff3a3",
        fontSize: 12,
        opacity: 0.9,
        revision: 0,
        createdAt: 1,
        updatedAt: 1,
      },
    ];

    expect(annotations.filter(isPdfTextNote).map((note) => note.content)).toEqual([
      "Standalone note",
    ]);
  });

  it("validates unscaled page geometry", () => {
    expect(isValidPdfAnnotationRect({ page: 2, x: 10, y: 20, width: 30, height: 40 })).toBe(true);
    expect(isValidPdfAnnotationRect({ page: 0, x: 10, y: 20, width: 30, height: 40 })).toBe(false);
    expect(isValidPdfAnnotationRect({ page: 1, x: -1, y: 20, width: 30, height: 40 })).toBe(false);
    expect(isValidPdfAnnotationRect({ page: 1, x: 10, y: 20, width: 0, height: 40 })).toBe(false);
    expect(isValidPdfAnnotationRect({ page: 1, x: 10, y: 20, width: Number.NaN, height: 40 })).toBe(false);
  });

  it("validates explicit note style bounds", () => {
    expect(isValidPdfTextNoteStyle("#fff3a3", 12, 0.9)).toBe(true);
    expect(isValidPdfTextNoteStyle("yellow", 12, 0.9)).toBe(false);
    expect(isValidPdfTextNoteStyle("#fff3a3", 7, 0.9)).toBe(false);
    expect(isValidPdfTextNoteStyle("#fff3a3", 12, 0)).toBe(false);
  });
});
