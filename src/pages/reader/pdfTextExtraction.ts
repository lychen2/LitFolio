type PdfTextItem = {
  str?: string;
  hasEOL?: boolean;
};

type PdfTextPage = {
  getTextContent(): Promise<{ items: unknown[] }>;
};

type PdfTextDocument = {
  numPages: number;
  getPage(n: number): Promise<unknown>;
};

/** Walk every page and concatenate its text via pdfjs's getTextContent API. */
export async function extractPdfText(pdfDocument: PdfTextDocument): Promise<string> {
  const out: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber++) {
    const text = await extractPageText(pdfDocument, pageNumber);
    out.push(text);
  }
  return out.join("\n\n");
}

async function extractPageText(
  pdfDocument: PdfTextDocument,
  pageNumber: number,
): Promise<string> {
  try {
    const page = (await pdfDocument.getPage(pageNumber)) as PdfTextPage;
    const content = await page.getTextContent();
    return content.items.map(textItem).join(" ");
  } catch (err) {
    console.warn(`[PdfPane] getTextContent page ${pageNumber} failed`, err);
    return "";
  }
}

function textItem(raw: unknown): string {
  const item = raw as PdfTextItem;
  const text = typeof item.str === "string" ? item.str : "";
  return item.hasEOL ? `${text}\n` : text;
}
