export const PDF_TEXT_NOTE_STYLE = {
  minFontSize: 8,
  maxFontSize: 28,
  minOpacity: 0.1,
  maxOpacity: 1,
} as const;

export const PDF_TEXT_NOTE_MAX_COORDINATE = 100_000;

export interface PdfAnnotationRect {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfHighlight {
  kind: "highlight";
  id: string;
  paperId: string;
  page: number;
  rect: unknown;
  selectedText: string;
  color: string;
  note: string | null;
}

export interface PdfTextNote {
  kind: "text-note";
  id: string;
  paperId: string;
  rect: PdfAnnotationRect;
  content: string;
  color: string;
  fontSize: number;
  opacity: number;
  revision: number;
  createdAt: number;
  updatedAt: number;
}

export type ReaderAnnotation = PdfHighlight | PdfTextNote;

export type PdfTextNotePatch = Partial<
  Pick<PdfTextNote, "rect" | "content" | "color" | "fontSize" | "opacity">
> & { expectedRevision: number };

export type PdfTextNoteCreateInput = Pick<
  PdfTextNote,
  "rect" | "content" | "color" | "fontSize" | "opacity"
>;

export interface PdfTextNoteSearchResult {
  note: PdfTextNote;
  snippet: string;
}

export function isPdfTextNote(annotation: ReaderAnnotation): annotation is PdfTextNote {
  return annotation.kind === "text-note";
}

export function isValidPdfAnnotationRect(rect: PdfAnnotationRect): boolean {
  return (
    Number.isInteger(rect.page) &&
    rect.page >= 1 &&
    finiteInRange(rect.x, 0, PDF_TEXT_NOTE_MAX_COORDINATE) &&
    finiteInRange(rect.y, 0, PDF_TEXT_NOTE_MAX_COORDINATE) &&
    finiteInRange(rect.width, Number.MIN_VALUE, PDF_TEXT_NOTE_MAX_COORDINATE) &&
    finiteInRange(rect.height, Number.MIN_VALUE, PDF_TEXT_NOTE_MAX_COORDINATE) &&
    rect.x + rect.width <= PDF_TEXT_NOTE_MAX_COORDINATE &&
    rect.y + rect.height <= PDF_TEXT_NOTE_MAX_COORDINATE
  );
}

export function isValidPdfTextNoteStyle(
  color: string,
  fontSize: number,
  opacity: number,
): boolean {
  return (
    /^#[0-9a-fA-F]{6}$/.test(color) &&
    finiteInRange(fontSize, PDF_TEXT_NOTE_STYLE.minFontSize, PDF_TEXT_NOTE_STYLE.maxFontSize) &&
    finiteInRange(opacity, PDF_TEXT_NOTE_STYLE.minOpacity, PDF_TEXT_NOTE_STYLE.maxOpacity)
  );
}

function finiteInRange(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}
