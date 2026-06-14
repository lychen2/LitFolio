import type { CSSProperties } from "react";

export const HIGHLIGHT_TYPES = [
  "background",
  "motivation",
  "method",
  "dataset",
  "result",
  "limitation",
  "comparison",
  "quote",
  "question",
] as const;

export type HighlightType = (typeof HIGHLIGHT_TYPES)[number];
export type HighlightTypeKey = HighlightType | "default";

type HighlightPalette = {
  bg: string;
  fg: string;
  ring: string;
  soft: string;
  pdf: string;
  pdfDark: string;
};

const HIGHLIGHT_TYPE_SET = new Set<string>(HIGHLIGHT_TYPES);

const PALETTES: Record<HighlightTypeKey, HighlightPalette> = {
  default: {
    bg: "oklch(0.82 0.12 88 / 0.22)",
    fg: "oklch(0.88 0.12 86)",
    ring: "oklch(0.8 0.13 84 / 0.72)",
    soft: "oklch(0.78 0.12 86 / 0.12)",
    pdf: "oklch(0.84 0.12 88 / 0.28)",
    pdfDark: "oklch(0.88 0.12 88 / 0.26)",
  },
  background: {
    bg: "oklch(0.78 0.09 250 / 0.22)",
    fg: "oklch(0.84 0.09 250)",
    ring: "oklch(0.78 0.1 250 / 0.7)",
    soft: "oklch(0.72 0.08 250 / 0.12)",
    pdf: "oklch(0.78 0.09 250 / 0.24)",
    pdfDark: "oklch(0.84 0.09 250 / 0.25)",
  },
  motivation: {
    bg: "oklch(0.77 0.13 310 / 0.23)",
    fg: "oklch(0.84 0.12 310)",
    ring: "oklch(0.77 0.13 310 / 0.72)",
    soft: "oklch(0.72 0.12 310 / 0.13)",
    pdf: "oklch(0.8 0.13 310 / 0.26)",
    pdfDark: "oklch(0.86 0.13 310 / 0.26)",
  },
  method: {
    bg: "oklch(0.77 0.12 230 / 0.22)",
    fg: "oklch(0.86 0.11 230)",
    ring: "oklch(0.78 0.12 230 / 0.72)",
    soft: "oklch(0.72 0.1 230 / 0.13)",
    pdf: "oklch(0.8 0.12 230 / 0.25)",
    pdfDark: "oklch(0.86 0.11 230 / 0.26)",
  },
  dataset: {
    bg: "oklch(0.79 0.11 190 / 0.22)",
    fg: "oklch(0.87 0.1 190)",
    ring: "oklch(0.78 0.11 190 / 0.7)",
    soft: "oklch(0.72 0.1 190 / 0.12)",
    pdf: "oklch(0.8 0.11 190 / 0.24)",
    pdfDark: "oklch(0.87 0.1 190 / 0.25)",
  },
  result: {
    bg: "oklch(0.79 0.13 145 / 0.22)",
    fg: "oklch(0.85 0.13 145)",
    ring: "oklch(0.76 0.13 145 / 0.72)",
    soft: "oklch(0.7 0.12 145 / 0.13)",
    pdf: "oklch(0.8 0.13 145 / 0.24)",
    pdfDark: "oklch(0.86 0.12 145 / 0.25)",
  },
  limitation: {
    bg: "oklch(0.75 0.13 25 / 0.22)",
    fg: "oklch(0.83 0.12 25)",
    ring: "oklch(0.73 0.13 25 / 0.72)",
    soft: "oklch(0.68 0.12 25 / 0.13)",
    pdf: "oklch(0.78 0.13 25 / 0.24)",
    pdfDark: "oklch(0.84 0.12 25 / 0.25)",
  },
  comparison: {
    bg: "oklch(0.76 0.13 285 / 0.22)",
    fg: "oklch(0.84 0.12 285)",
    ring: "oklch(0.76 0.13 285 / 0.72)",
    soft: "oklch(0.7 0.12 285 / 0.13)",
    pdf: "oklch(0.79 0.13 285 / 0.24)",
    pdfDark: "oklch(0.85 0.12 285 / 0.25)",
  },
  quote: {
    bg: "oklch(0.82 0.1 78 / 0.23)",
    fg: "oklch(0.88 0.1 78)",
    ring: "oklch(0.78 0.11 78 / 0.72)",
    soft: "oklch(0.72 0.1 78 / 0.13)",
    pdf: "oklch(0.84 0.1 78 / 0.25)",
    pdfDark: "oklch(0.88 0.1 78 / 0.26)",
  },
  question: {
    bg: "oklch(0.8 0.13 55 / 0.23)",
    fg: "oklch(0.87 0.12 55)",
    ring: "oklch(0.77 0.13 55 / 0.72)",
    soft: "oklch(0.72 0.12 55 / 0.13)",
    pdf: "oklch(0.82 0.13 55 / 0.25)",
    pdfDark: "oklch(0.88 0.12 55 / 0.26)",
  },
};

export function highlightTypeKey(label: string | null | undefined): HighlightTypeKey {
  const normalized = label?.trim() ?? "";
  return HIGHLIGHT_TYPE_SET.has(normalized) ? (normalized as HighlightType) : "default";
}

export function highlightPalette(label: string | null | undefined): HighlightPalette {
  return PALETTES[highlightTypeKey(label)];
}

export function highlightStyleVars(label: string | null | undefined): CSSProperties {
  const palette = highlightPalette(label);
  return {
    "--litera-highlight-bg": palette.bg,
    "--litera-highlight-fg": palette.fg,
    "--litera-highlight-ring": palette.ring,
    "--litera-highlight-soft": palette.soft,
  } as CSSProperties;
}
