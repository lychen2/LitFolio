/** Split a paper's Markdown into readable units and keep PDF extraction page markers. */

export type ReadingBlockKind = "heading" | "paragraph" | "list" | "quote" | "table" | "code";

export interface ReadingBlock {
  kind: ReadingBlockKind;
  /** Heading depth 1-6; 0 for every other block kind. */
  level: number;
  /** Block source with page markers removed. */
  markdown: string;
  /** Page from the marker directly above the block, when the cached text had one. */
  page: number | null;
  /** Extraction noise such as a standalone "Page 7" or "3 of 12" line. */
  artifact: boolean;
}

export interface ReadingDocument {
  blocks: ReadingBlock[];
  hasPageMarkers: boolean;
}

const PAGE_MARKER = /^<!--\s*page\s*:\s*(\d+)\s*-->$/i;
const HEADING = /^(#{1,6})\s+(.*\S)\s*$/;
const LIST_ITEM = /^(?:[-*+]|\d+[.)])\s+\S/;
const QUOTE_PREFIX = /^>\s?/;
const TABLE_ROW = /^\|.*\|$/;
const TABLE_SEPARATOR = /^\|[\s:|-]+\|$/;
const ARTIFACT_LINE = /^(?:p\.?\s*\d+(?:\s*(?:of|\/)\s*\d+)?|page\s+\d+(?:\s*(?:of|\/)\s*\d+)?|\d+\s*(?:of|\/)\s*\d+|\d{1,4}|第\s*\d+\s*页)$/i;

function isTableStart(lines: string[], index: number): boolean {
  return (
    TABLE_ROW.test(lines[index].trim()) &&
    index + 1 < lines.length &&
    TABLE_SEPARATOR.test(lines[index + 1].trim())
  );
}

export function parseReadingDocument(markdown: string): ReadingDocument {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReadingBlock[] = [];
  let hasPageMarkers = false;
  let currentPage: number | null = null;
  let i = 0;

  const push = (kind: ReadingBlockKind, level: number, body: string) => {
    const trimmed = body.trim();
    if (!trimmed) return;
    blocks.push({
      kind,
      level,
      markdown: trimmed,
      // A marker governs every following block until the next marker, so each
      // block keeps the page the extractor placed its text on.
      page: currentPage,
      artifact: kind === "paragraph" && !trimmed.includes("\n") && ARTIFACT_LINE.test(trimmed),
    });
  };

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) {
      i++;
      continue;
    }

    const marker = PAGE_MARKER.exec(line);
    if (marker) {
      hasPageMarkers = true;
      currentPage = Number(marker[1]);
      i++;
      continue;
    }

    if (line.startsWith("```")) {
      const body = [raw];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        body.push(lines[i]);
        i++;
      }
      if (i < lines.length) {
        body.push(lines[i]);
        i++;
      }
      push("code", 0, body.join("\n"));
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      push("heading", heading[1].length, line);
      i++;
      continue;
    }

    if (isTableStart(lines, i)) {
      const body = [lines[i].trim(), lines[i + 1].trim()];
      i += 2;
      while (i < lines.length && TABLE_ROW.test(lines[i].trim())) {
        body.push(lines[i].trim());
        i++;
      }
      push("table", 0, body.join("\n"));
      continue;
    }

    if (QUOTE_PREFIX.test(line)) {
      const body: string[] = [];
      while (i < lines.length && QUOTE_PREFIX.test(lines[i].trim())) {
        body.push(lines[i].trim());
        i++;
      }
      push("quote", 0, body.join("\n"));
      continue;
    }

    if (LIST_ITEM.test(line)) {
      const body: string[] = [];
      while (i < lines.length) {
        const candidate = lines[i];
        const candidateLine = candidate.trim();
        if (!candidateLine) break;
        // Indented lines continue the current item; anything else ends the list.
        if (!LIST_ITEM.test(candidateLine) && !/^\s{2,}\S/.test(candidate)) break;
        body.push(candidateLine);
        i++;
      }
      push("list", 0, body.join("\n"));
      continue;
    }

    const body: string[] = [];
    while (i < lines.length) {
      const candidate = lines[i];
      const candidateLine = candidate.trim();
      if (!candidateLine) break;
      if (
        PAGE_MARKER.test(candidateLine) ||
        candidateLine.startsWith("```") ||
        HEADING.test(candidateLine) ||
        QUOTE_PREFIX.test(candidateLine) ||
        LIST_ITEM.test(candidateLine) ||
        isTableStart(lines, i)
      ) {
        break;
      }
      body.push(candidateLine);
      i++;
    }
    push("paragraph", 0, body.join("\n"));
  }

  return { blocks, hasPageMarkers };
}
