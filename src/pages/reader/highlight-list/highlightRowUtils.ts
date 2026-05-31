import type { Highlight } from "@/lib/api";

export function hasCondensedAction(highlight: Highlight) {
  return !!highlight.explanation_text || !!highlight.summary_text || !!highlight.translation_text;
}

export function hasCondensedContent(highlight: Highlight) {
  return !!highlight.explanation_text || !!highlight.summary_text || !!highlight.translation_text;
}

export function countChars(text: string) {
  return Array.from(text.trim()).length;
}

export function normalizePreview(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized || "(empty)";
}
