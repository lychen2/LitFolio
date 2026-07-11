export const READER_MARGIN_NOTE_LABEL = "reader-margin-note";

type LabelLike = {
  label: string | null;
};

export function isReaderMarginNote(value: LabelLike): boolean {
  return value.label === READER_MARGIN_NOTE_LABEL;
}

type ExtractPdfSelectionTextInput = {
  highlighterText?: string | null;
  windowSelectionText?: string | null;
  selectionInsidePdf: boolean;
};

export function extractPdfSelectionText({
  highlighterText,
  windowSelectionText,
  selectionInsidePdf,
}: ExtractPdfSelectionTextInput): string {
  const highlighterSelection = highlighterText?.trim();
  if (highlighterSelection) return highlighterSelection;
  if (!selectionInsidePdf) return "";
  return windowSelectionText?.trim() ?? "";
}

type NextLinkedPdfNoteDraftInput = {
  currentDraft: string;
  incomingNote: string | null;
  dirty: boolean;
};

export function nextLinkedPdfNoteDraft({
  currentDraft,
  incomingNote,
  dirty,
}: NextLinkedPdfNoteDraftInput): string {
  if (dirty) return currentDraft;
  return incomingNote ?? "";
}

export function highlightNoteUpdateValue(draft: string): string | null {
  const trimmed = draft.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function visiblePdfNoteText(draft: string): string | null {
  const trimmed = draft.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function pdfNoteFontSizePx(pageScale: number, baseSize = 12): number {
  return Math.max(6, Math.round(pdfNoteFontSizeBase({ noteFontSize: baseSize }) * pageScale));
}

export function pdfNoteFontSizeBase(value: { noteFontSize?: unknown }): number {
  return clampNoteFontSize(typeof value.noteFontSize === "number" ? value.noteFontSize : 12);
}

export function nextPdfNoteFontSize(current: number, delta: number): number {
  return clampNoteFontSize(current + delta);
}

function clampNoteFontSize(value: number): number {
  return Math.min(28, Math.max(8, Math.round(value)));
}

type StandalonePdfNotePositionInput = {
  pageNumber: number;
  pageWidth: number;
  pageHeight: number;
  visibleTop?: number;
  rect?: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
};

type StandalonePdfNoteRect = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  height: number;
  pageNumber: number;
};

export function createStandalonePdfNotePosition({
  pageNumber,
  pageWidth,
  pageHeight,
  visibleTop,
  rect,
}: StandalonePdfNotePositionInput): {
  pageNumber: number;
  boundingRect: StandalonePdfNoteRect;
  rects: StandalonePdfNoteRect[];
} {
  const anchorSize = 10;
  const fallbackX = 24;
  const fallbackY = Math.min(
    Math.max(16, Math.round(visibleTop ?? 80)),
    Math.max(16, Math.round(pageHeight) - anchorSize - 8),
  );
  const rawX1 = rect ? Math.min(rect.x1, rect.x2) : fallbackX;
  const rawY1 = rect ? Math.min(rect.y1, rect.y2) : fallbackY;
  const rawX2 = rect ? Math.max(rect.x1, rect.x2) : fallbackX + anchorSize;
  const rawY2 = rect ? Math.max(rect.y1, rect.y2) : fallbackY + anchorSize;
  const x1 = clampRectCoord(rawX1, pageWidth, 16);
  const y1 = clampRectCoord(rawY1, pageHeight, 16);
  const x2 = clampRectCoord(rawX2, pageWidth, x1 + anchorSize);
  const y2 = clampRectCoord(rawY2, pageHeight, y1 + anchorSize);
  const noteRect = {
    x1,
    y1,
    x2: Math.max(x2, x1 + anchorSize),
    y2: Math.max(y2, y1 + anchorSize),
    width: pageWidth,
    height: pageHeight,
    pageNumber,
  };
  return { pageNumber, boundingRect: noteRect, rects: [noteRect] };
}

export function buildReaderSelectionQuestion(question: string, selection: string): string {
  const trimmedQuestion = question.trim() || "Explain this selected passage in the context of the paper.";
  return `${trimmedQuestion}\n\nSelected passage:\n${selection.trim()}`;
}

function clampRectCoord(value: number, max: number, min: number): number {
  return Math.min(Math.max(min, Math.round(value)), Math.max(min, Math.round(max) - min));
}
