import { describe, expect, it } from "vitest";
import {
  READER_MARGIN_NOTE_LABEL,
  buildReaderSelectionQuestion,
  createStandalonePdfNotePosition,
  extractPdfSelectionText,
  highlightNoteUpdateValue,
  nextPdfNoteFontSize,
  pdfNoteFontSizeBase,
  pdfNoteFontSizePx,
  visiblePdfNoteText,
  isReaderMarginNote,
  nextLinkedPdfNoteDraft,
} from "./pdfSelectionHelpers";

describe("extractPdfSelectionText", () => {
  it("prefers the highlighter text payload so Ctrl+C copies the PDF selection", () => {
    expect(
      extractPdfSelectionText({
        highlighterText: "  Graph retrieval\naugmented generation  ",
        windowSelectionText: "stale browser selection",
        selectionInsidePdf: true,
      }),
    ).toBe("Graph retrieval\naugmented generation");
  });

  it("falls back to the window selection only when the selection is inside the PDF pane", () => {
    expect(
      extractPdfSelectionText({
        highlighterText: "   ",
        windowSelectionText: "  selected from pdf text layer  ",
        selectionInsidePdf: true,
      }),
    ).toBe("selected from pdf text layer");

    expect(
      extractPdfSelectionText({
        highlighterText: null,
        windowSelectionText: "selected from notes pane",
        selectionInsidePdf: false,
      }),
    ).toBe("");
  });
});

describe("linked PDF note drafts", () => {
  it("keeps a dirty local note draft when the linked highlight refreshes", () => {
    expect(
      nextLinkedPdfNoteDraft({
        currentDraft: "local note in progress",
        incomingNote: "remote highlight note",
        dirty: true,
      }),
    ).toBe("local note in progress");
  });

  it("uses the linked highlight note while the note box has no unsaved edits", () => {
    expect(
      nextLinkedPdfNoteDraft({
        currentDraft: "old note",
        incomingNote: "saved highlight note",
        dirty: false,
      }),
    ).toBe("saved highlight note");

    expect(
      nextLinkedPdfNoteDraft({
        currentDraft: "old note",
        incomingNote: null,
        dirty: false,
      }),
    ).toBe("");
  });

  it("maps blank drafts to highlight_update_note null and preserves meaningful text", () => {
    expect(highlightNoteUpdateValue("   \n\t  ")).toBeNull();
    expect(highlightNoteUpdateValue("  keep this note  ")).toBe("keep this note");
  });
});

describe("standalone PDF notes", () => {
  it("creates a small highlight anchor on the current visible page without selected text", () => {
    expect(
      createStandalonePdfNotePosition({
        pageNumber: 3,
        pageWidth: 612,
        pageHeight: 792,
        visibleTop: 320,
      }),
    ).toEqual({
      pageNumber: 3,
      boundingRect: { x1: 24, y1: 320, x2: 34, y2: 330, width: 612, height: 792, pageNumber: 3 },
      rects: [{ x1: 24, y1: 320, x2: 34, y2: 330, width: 612, height: 792, pageNumber: 3 }],
    });
  });

  it("keeps a standalone note anchor inside page bounds", () => {
    expect(
      createStandalonePdfNotePosition({
        pageNumber: 1,
        pageWidth: 200,
        pageHeight: 100,
        visibleTop: 500,
      }).boundingRect.y1,
    ).toBe(82);
  });

  it("normalizes a drawn note rectangle regardless of drag direction", () => {
    expect(
      createStandalonePdfNotePosition({
        pageNumber: 2,
        pageWidth: 612,
        pageHeight: 792,
        rect: { x1: 420, y1: 260, x2: 180, y2: 120 },
      }).boundingRect,
    ).toEqual({ x1: 180, y1: 120, x2: 420, y2: 260, width: 612, height: 792, pageNumber: 2 });
  });

  it("marks standalone notes so they can stay out of the highlight list", () => {
    expect(READER_MARGIN_NOTE_LABEL).toBe("reader-margin-note");
    expect(isReaderMarginNote({ label: "reader-margin-note" })).toBe(true);
    expect(isReaderMarginNote({ label: "question" })).toBe(false);
    expect(isReaderMarginNote({ label: null })).toBe(false);
  });

  it("hides empty standalone note text instead of showing placeholder after blur", () => {
    expect(visiblePdfNoteText("   \n  ")).toBeNull();
    expect(visiblePdfNoteText("  marginal note  ")).toBe("marginal note");
  });

  it("scales standalone note font size with the PDF page zoom", () => {
    expect(pdfNoteFontSizePx(0.5)).toBe(6);
    expect(pdfNoteFontSizePx(1)).toBe(12);
    expect(pdfNoteFontSizePx(1.75)).toBe(21);
  });

  it("reads and bounds custom standalone note font sizes", () => {
    expect(pdfNoteFontSizeBase({ noteFontSize: 18 })).toBe(18);
    expect(pdfNoteFontSizeBase({ noteFontSize: 100 })).toBe(28);
    expect(pdfNoteFontSizeBase({ noteFontSize: 2 })).toBe(8);
    expect(pdfNoteFontSizeBase({})).toBe(12);
  });

  it("steps custom standalone note font sizes within bounds", () => {
    expect(nextPdfNoteFontSize(12, 2)).toBe(14);
    expect(nextPdfNoteFontSize(28, 2)).toBe(28);
    expect(nextPdfNoteFontSize(8, -2)).toBe(8);
  });
});

describe("reader selection questions", () => {
  it("builds an in-reader question from the selected passage", () => {
    expect(buildReaderSelectionQuestion("  How does this relate to RAG?  ", " The retrieval module reranks snippets. ")).toBe(
      "How does this relate to RAG?\n\nSelected passage:\nThe retrieval module reranks snippets.",
    );
  });

  it("uses a default prompt when the reader asks from a selection without typing", () => {
    expect(buildReaderSelectionQuestion("", "Ablation drops 3.4 F1.")).toBe(
      "Explain this selected passage in the context of the paper.\n\nSelected passage:\nAblation drops 3.4 F1.",
    );
  });
});
