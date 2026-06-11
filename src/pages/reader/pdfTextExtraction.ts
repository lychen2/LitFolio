type PdfTextItem = {
  str?: string;
  hasEOL?: boolean;
  transform?: number[];
  width?: number;
  height?: number;
};

type PdfTextPage = {
  getTextContent(): Promise<{ items: unknown[] }>;
};

type PdfTextDocument = {
  numPages: number;
  getPage(n: number): Promise<unknown>;
};

type PositionedTextItem = {
  text: string;
  hasEOL: boolean;
  x: number;
  y: number;
  size: number;
};

type MarkdownLine = {
  text: string;
  x: number;
  size: number;
};

type MarkdownPage = {
  pageNumber: number;
  lines: MarkdownLine[];
};

const HEADING_MAX_WORDS = 18;
const PAGE_BREAK = "\n\n";

/** Walk every page and convert PDF.js text content into Markdown for RAG. */
export async function extractPdfText(pdfDocument: PdfTextDocument): Promise<string> {
  const pages: MarkdownPage[] = [];
  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber++) {
    const lines = await extractPageLines(pdfDocument, pageNumber);
    if (lines.length > 0) pages.push({ pageNumber, lines });
  }
  const repeatedMargin = repeatedMarginLineKeys(pages);
  return pages
    .map((page) => {
      const lines = page.lines.filter((line) => !repeatedMargin.has(lineKey(line.text)));
      if (lines.length === 0) return "";
      return [`<!-- page:${page.pageNumber} -->`, ...renderMarkdownLines(lines)].join("\n");
    })
    .filter(Boolean)
    .join(PAGE_BREAK);
}

async function extractPageLines(
  pdfDocument: PdfTextDocument,
  pageNumber: number,
): Promise<MarkdownLine[]> {
  try {
    const page = (await pdfDocument.getPage(pageNumber)) as PdfTextPage;
    const content = await page.getTextContent();
    return textLines(content.items);
  } catch (err) {
    console.warn(`[PdfPane] getTextContent page ${pageNumber} failed`, err);
    return [];
  }
}

function textLines(rawItems: unknown[]): MarkdownLine[] {
  const items = rawItems.map(textItem).filter((item) => item.text.trim().length > 0);
  if (items.length === 0) return [];

  const lines: MarkdownLine[] = [];
  let current: PositionedTextItem[] = [];

  for (const item of items) {
    const previous = current.length > 0 ? current[current.length - 1] : undefined;
    if (previous && isNewLine(previous, item)) {
      pushLine(lines, current);
      current = [];
    }
    current.push(item);
    if (item.hasEOL) {
      pushLine(lines, current);
      current = [];
    }
  }
  pushLine(lines, current);
  return lines;
}

function textItem(raw: unknown): PositionedTextItem {
  const item = raw as PdfTextItem;
  const text = typeof item.str === "string" ? item.str : "";
  const transform = Array.isArray(item.transform) ? item.transform : [];
  const x = numberAt(transform, 4);
  const y = numberAt(transform, 5);
  const size = Math.abs(numberAt(transform, 3) || item.height || 0);
  return {
    text,
    hasEOL: item.hasEOL === true,
    x,
    y,
    size,
  };
}

function numberAt(values: number[], index: number): number {
  const value = values[index];
  return Number.isFinite(value) ? value : 0;
}

function isNewLine(previous: PositionedTextItem, next: PositionedTextItem): boolean {
  if (previous.y === 0 || next.y === 0) return false;
  return Math.abs(previous.y - next.y) > Math.max(previous.size, next.size, 8) * 0.55;
}

function pushLine(lines: MarkdownLine[], items: PositionedTextItem[]): void {
  if (items.length === 0) return;
  const text = cleanPdfLine(joinLineItems(items));
  if (!text || isNoiseText(text)) return;
  lines.push({
    text,
    x: Math.min(...items.map((item) => item.x)),
    size: average(items.map((item) => item.size).filter((size) => size > 0)),
  });
}

function joinLineItems(items: PositionedTextItem[]): string {
  let out = "";
  for (const item of items) {
    const text = item.text.trim();
    if (!text) continue;
    if (!out || shouldAttach(out, text)) {
      out += text;
    } else {
      out += ` ${text}`;
    }
  }
  return out.replace(/\s+/g, " ").trim();
}

function shouldAttach(previous: string, next: string): boolean {
  return /^[,.;:!?%)]/.test(next) || /[([]$/.test(previous) || previous.endsWith("-");
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function renderMarkdownLines(lines: MarkdownLine[]): string[] {
  const bodySize = median(lines.map((line) => line.size).filter((size) => size > 0));
  const rendered: string[] = [];
  let paragraph = "";

  for (const line of lines) {
    const text = line.text.trim();
    if (!text) continue;

    if (isHeading(line, bodySize)) {
      flushParagraph(rendered, paragraph);
      paragraph = "";
      rendered.push(`${headingPrefix(line, bodySize)} ${text}`);
      continue;
    }

    if (isCaptionText(text)) {
      flushParagraph(rendered, paragraph);
      paragraph = "";
      rendered.push(text);
      continue;
    }

    if (isListLine(text)) {
      flushParagraph(rendered, paragraph);
      paragraph = "";
      rendered.push(normalizeListLine(text));
      continue;
    }

    if (!paragraph) {
      paragraph = text;
    } else if (paragraph.endsWith("-")) {
      paragraph = `${paragraph.slice(0, -1)}${text}`;
    } else {
      paragraph = `${paragraph} ${text}`;
    }
  }
  flushParagraph(rendered, paragraph);
  return rendered;
}

function isHeading(line: MarkdownLine, bodySize: number): boolean {
  if (bodySize <= 0) return false;
  const text = line.text;
  if (isCaptionText(text) || isNoiseText(text)) return false;
  const wordCount = text.split(/\s+/).length;
  const hasLowercase = /[a-z]/.test(text);
  const isMostlyTitleLike = text.length <= 120 && wordCount <= HEADING_MAX_WORDS;
  return isMostlyTitleLike && (line.size >= bodySize * 1.22 || (!hasLowercase && wordCount <= 10));
}

function headingPrefix(line: MarkdownLine, bodySize: number): string {
  return line.size >= bodySize * 1.65 ? "#" : "##";
}

function isListLine(text: string): boolean {
  return /^([*•-]|\d+[.)])\s+/.test(text);
}

function normalizeListLine(text: string): string {
  return text.replace(/^•\s+/, "- ");
}

function cleanPdfLine(raw: string): string {
  return normalizeInlineSpacing(raw.replace(/\s+/g, " ").trim());
}

function normalizeInlineSpacing(text: string): string {
  return text
    .replace(/\[\s*([^\]]+?)\s*\]/g, (_match, inner: string) => {
      const normalized = inner
        .split(/\s+/)
        .join(" ")
        .replace(/\s+([,;:])/g, "$1");
      return `[${normalized}]`;
    })
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\s+([,.])/g, "$1");
}

function isNoiseText(text: string): boolean {
  if (/^\d+(\s+of\s+\d+)?$/i.test(text)) return true;
  if (text.length <= 2 && !/[A-Za-z]/.test(text)) return true;
  const compact = text.replace(/\s/g, "");
  if (compact.length < 5) return false;
  const alnum = compact.replace(/[^0-9A-Za-z]/g, "").length;
  return alnum / compact.length < 0.35;
}

function isCaptionText(text: string): boolean {
  return /^(fig\.|figure|table)\s*\d+/i.test(text);
}

function repeatedMarginLineKeys(pages: MarkdownPage[]): Set<string> {
  if (pages.length < 3) return new Set();
  const counts = new Map<string, number>();
  for (const page of pages) {
    const margin = [...page.lines.slice(0, 4), ...page.lines.slice(-4)];
    const seen = new Set(
      margin
        .map((line) => line.text)
        .filter(isRepeatableMarginText)
        .map(lineKey),
    );
    for (const key of seen) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count >= 2).map(([key]) => key));
}

function isRepeatableMarginText(text: string): boolean {
  return text.length <= 120 && !isCaptionText(text);
}

function lineKey(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function flushParagraph(rendered: string[], paragraph: string): void {
  const trimmed = paragraph.trim();
  if (trimmed) rendered.push(trimmed);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}
