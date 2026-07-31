import {
  isValidPdfAnnotationRect,
  isValidPdfTextNoteStyle,
  type PdfAnnotationRect,
  type PdfHighlight,
  type PdfTextNote,
  type PdfTextNoteSearchResult,
  type ReaderAnnotation,
} from "@/core/contracts";

import {
  field,
  numberField,
  object,
  schemaError,
  stringField,
} from "./apiSchemaCore";

export function parsePdfAnnotationRect(value: unknown, path = "PdfAnnotationRect"): PdfAnnotationRect {
  const obj = object(value, path);
  const rect = {
    page: numberField(obj, "page", path),
    x: numberField(obj, "x", path),
    y: numberField(obj, "y", path),
    width: numberField(obj, "width", path),
    height: numberField(obj, "height", path),
  };
  if (!isValidPdfAnnotationRect(rect)) {
    throw schemaError(path, "valid unscaled PDF page geometry", value);
  }
  return rect;
}

export function parsePdfTextNote(value: unknown, path = "PdfTextNote"): PdfTextNote {
  const obj = object(value, path);
  if (stringField(obj, "kind", path) !== "text-note") {
    throw schemaError(`${path}.kind`, '"text-note"', obj.kind);
  }
  const color = stringField(obj, "color", path);
  const fontSize = numberField(obj, "fontSize", path);
  const opacity = numberField(obj, "opacity", path);
  if (!isValidPdfTextNoteStyle(color, fontSize, opacity)) {
    throw schemaError(path, "valid PDF text-note style", value);
  }
  const revision = numberField(obj, "revision", path);
  if (!Number.isInteger(revision) || revision < 0) {
    throw schemaError(`${path}.revision`, "non-negative integer", revision);
  }
  return {
    kind: "text-note",
    id: stringField(obj, "id", path),
    paperId: stringField(obj, "paperId", path),
    rect: parsePdfAnnotationRect(field(obj, "rect", path), `${path}.rect`),
    content: stringField(obj, "content", path),
    color,
    fontSize,
    opacity,
    revision,
    createdAt: numberField(obj, "createdAt", path),
    updatedAt: numberField(obj, "updatedAt", path),
  };
}

export function parseReaderAnnotation(value: unknown, path = "ReaderAnnotation"): ReaderAnnotation {
  const obj = object(value, path);
  const kind = stringField(obj, "kind", path);
  if (kind === "text-note") return parsePdfTextNote(value, path);
  if (kind !== "highlight") {
    throw schemaError(`${path}.kind`, '"highlight" or "text-note"', kind);
  }
  return parsePdfHighlight(obj, path);
}

export function parsePdfTextNoteSearchResult(
  value: unknown,
  path = "PdfTextNoteSearchResult",
): PdfTextNoteSearchResult {
  const obj = object(value, path);
  return {
    note: parsePdfTextNote(field(obj, "note", path), `${path}.note`),
    snippet: stringField(obj, "snippet", path),
  };
}

function parsePdfHighlight(obj: Record<string, unknown>, path: string): PdfHighlight {
  return {
    kind: "highlight",
    id: stringField(obj, "id", path),
    paperId: stringField(obj, "paperId", path),
    page: numberField(obj, "page", path),
    rect: field(obj, "rect", path),
    selectedText: stringField(obj, "selectedText", path),
    color: stringField(obj, "color", path),
    note: nullableString(obj, "note", path),
  };
}

function nullableString(obj: Record<string, unknown>, key: string, path: string): string | null {
  const value = field(obj, key, path);
  if (value === null) return null;
  if (typeof value !== "string") throw schemaError(`${path}.${key}`, "string|null", value);
  return value;
}

export interface LegacyReaderNotesPreview {
  schemaVersion: number;
  targetVersion: number;
  totalSentinelRows: number;
  alreadyConverted: number;
  convertible: number;
  paperIds: string[];
}

export interface LegacyReaderNotesReport {
  schemaVersion: number;
  targetVersion: number;
  destination: string;
  verifiedBackupPath: string;
  sourceRows: number;
  converted: number;
  alreadyConverted: number;
  failed: number;
  defaultedStyles: number;
  markdownFiles: number;
  sectionFiles: number;
  emptyDefaultSections: number;
  rollbackState: "committed" | "rolled-back";
}

export function parseLegacyReaderNotesPreview(
  value: unknown,
  path = "LegacyReaderNotesPreview",
): LegacyReaderNotesPreview {
  const obj = object(value, path);
  return {
    schemaVersion: numberField(obj, "schemaVersion", path),
    targetVersion: numberField(obj, "targetVersion", path),
    totalSentinelRows: numberField(obj, "totalSentinelRows", path),
    alreadyConverted: numberField(obj, "alreadyConverted", path),
    convertible: numberField(obj, "convertible", path),
    paperIds: parseStringArray(obj, "paperIds", path),
  };
}

export function parseLegacyReaderNotesReport(
  value: unknown,
  path = "LegacyReaderNotesReport",
): LegacyReaderNotesReport {
  const obj = object(value, path);
  return {
    schemaVersion: numberField(obj, "schemaVersion", path),
    targetVersion: numberField(obj, "targetVersion", path),
    destination: stringField(obj, "destination", path),
    verifiedBackupPath: stringField(obj, "verifiedBackupPath", path),
    sourceRows: numberField(obj, "sourceRows", path),
    converted: numberField(obj, "converted", path),
    alreadyConverted: numberField(obj, "alreadyConverted", path),
    failed: numberField(obj, "failed", path),
    defaultedStyles: numberField(obj, "defaultedStyles", path),
    markdownFiles: numberField(obj, "markdownFiles", path),
    sectionFiles: numberField(obj, "sectionFiles", path),
    emptyDefaultSections: numberField(obj, "emptyDefaultSections", path),
    rollbackState: parseRollbackState(obj, "rollbackState", path),
  };
}

function parseStringArray(obj: Record<string, unknown>, key: string, path: string): string[] {
  const value = field(obj, key, path);
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw schemaError(`${path}.${key}`, "string[]", value);
  }
  return value;
}

function parseRollbackState(
  obj: Record<string, unknown>,
  key: string,
  path: string,
): "committed" | "rolled-back" {
  const value = field(obj, key, path);
  if (value === "committed" || value === "rolled-back") return value;
  throw schemaError(`${path}.${key}`, '"committed" | "rolled-back"', value);
}
