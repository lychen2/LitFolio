import type { PdfAnnotationRect } from "@/core/contracts";

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

export type PdfPageSize = {
  width: number;
  height: number;
};

export function createPdfTextNoteRect({
  page,
  pageSize,
  start,
  end,
}: {
  page: number;
  pageSize: PdfPageSize;
  start: { x: number; y: number };
  end: { x: number; y: number };
}): PdfAnnotationRect {
  const minSize = 20;
  const defaultWidth = 220;
  const defaultHeight = 120;
  const x = clamp(start.x, 0, pageSize.width);
  const y = clamp(start.y, 0, pageSize.height);
  const draggedWidth = Math.abs(end.x - start.x);
  const draggedHeight = Math.abs(end.y - start.y);
  const rawX = Math.min(start.x, end.x);
  const rawY = Math.min(start.y, end.y);
  const width = draggedWidth >= minSize
    ? Math.min(draggedWidth, pageSize.width - Math.max(0, rawX))
    : Math.min(defaultWidth, pageSize.width - x);
  const height = draggedHeight >= minSize
    ? Math.min(draggedHeight, pageSize.height - Math.max(0, rawY))
    : Math.min(defaultHeight, pageSize.height - y);
  return {
    page,
    x: clamp(draggedWidth >= minSize ? rawX : x, 0, Math.max(0, pageSize.width - minSize)),
    y: clamp(draggedHeight >= minSize ? rawY : y, 0, Math.max(0, pageSize.height - minSize)),
    width: Math.max(minSize, width),
    height: Math.max(minSize, height),
  };
}

export function pdfTextNoteViewportRect(
  rect: PdfAnnotationRect,
  pageSize: PdfPageSize,
  viewportSize: PdfPageSize,
): { left: number; top: number; width: number; height: number; scale: number } {
  const scaleX = viewportSize.width / pageSize.width;
  const scaleY = viewportSize.height / pageSize.height;
  return {
    left: rect.x * scaleX,
    top: rect.y * scaleY,
    width: rect.width * scaleX,
    height: rect.height * scaleY,
    scale: (scaleX + scaleY) / 2,
  };
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
