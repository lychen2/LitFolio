export interface PdfNavigationPosition {
  scrollTop: number;
}

export function shouldRecordPdfNavigation(anchor: HTMLAnchorElement, pdfUrl: string | null): boolean {
  if (extractDoi(anchor.href) || extractDoi(anchor.textContent ?? "")) return false;
  if (anchor.dataset.figLink === "1") return true;

  const rawHref = anchor.getAttribute("href") ?? "";
  if (rawHref.startsWith("#")) return true;
  if (!anchor.hash) return false;
  if (!pdfUrl) return true;

  return anchor.href.startsWith(`${pdfUrl}#`) || anchor.href === rawHref;
}

export function pushPdfNavigationPosition(
  stack: readonly PdfNavigationPosition[],
  position: PdfNavigationPosition,
): PdfNavigationPosition[] {
  const previous = stack.at(-1);
  if (previous && Math.abs(previous.scrollTop - position.scrollTop) < 4) return [...stack];
  return [...stack, position];
}

function extractDoi(raw: string): string | null {
  const match = raw.match(/\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i);
  return match?.[0] ?? null;
}
