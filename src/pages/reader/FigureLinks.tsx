import { useEffect, useState } from "react";

/** Regex patterns for academic cross-references (case-insensitive). */
const REF_RE =
  /(?:Figure|Fig\.?|Table|Eq\.?|Equation)\s*\d+(?:\.\d+)?(?:\s*[:\-–—]\s*\d+)?/gi;

/** Pattern for locating captions in full text. */
const CAPTION_RE =
  /^((?:Figure|Fig\.?|Table|Eq\.?|Equation)\s*(\d+(?:\.\d+)?))\s*[:\-–—]/gim;

/**
 * Scan extracted PDF text to build a mapping from reference strings
 * (e.g. "Figure 1", "Table 2") to their page numbers.
 */
function buildCaptionIndex(
  pdfDocument: { numPages: number; getPage(n: number): Promise<unknown> },
  onReady: (index: Map<string, number>) => void,
) {
  const index = new Map<string, number>();

  (async () => {
    for (let i = 1; i <= pdfDocument.numPages; i++) {
      try {
        const page = (await pdfDocument.getPage(i)) as {
          getTextContent(): Promise<{ items: { str?: string; hasEOL?: boolean }[] }>;
        };
        const content = await page.getTextContent();
        const buf: string[] = [];
        for (const raw of content.items) {
          const item = raw as { str?: string; hasEOL?: boolean };
          if (typeof item.str === "string") buf.push(item.str);
          if (item.hasEOL) buf.push("\n");
        }
        const pageText = buf.join(" ");
        CAPTION_RE.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = CAPTION_RE.exec(pageText)) !== null) {
          const key = m[1].replace(/\s+/g, " ").toLowerCase();
          if (!index.has(key)) index.set(key, i);
        }
      } catch {
        // skip failed pages
      }
    }
    onReady(index);
  })();
}

/**
 * Side-effect component: observes the PDF text layer for figure/table
 * cross-references and makes them clickable jump links.
 *
 * Render inside PdfLoader so it receives the pdfDocument. Returns null.
 */
export function FigureLinks({
  pdfDocument,
  pdfUrl,
}: {
  pdfDocument: { numPages: number; getPage(n: number): Promise<unknown> };
  pdfUrl: string;
}) {
  const [captionIndex, setCaptionIndex] = useState<Map<string, number> | null>(
    null,
  );

  // Build caption index on document load.
  useEffect(() => {
    setCaptionIndex(null);
    buildCaptionIndex(pdfDocument, setCaptionIndex);
  }, [pdfDocument, pdfUrl]);

  // Observe text layer and inject jump links.
  useEffect(() => {
    const index = captionIndex;
    if (!index || index.size === 0) return;

    const processed = new WeakSet<Node>();

    function processNode(node: Node) {
      if (node.nodeType !== Node.TEXT_NODE) return;
      if (processed.has(node)) return;
      const text = node.textContent;
      if (!text || !REF_RE.test(text)) return;

      const parent = node.parentElement;
      if (!parent || parent.tagName === "A" || parent.dataset.figLink) return;

      processed.add(node);

      const container = parent.closest("[data-page-number]");
      if (!container) return;
      const currentPage = Number(container.getAttribute("data-page-number"));

      const parts = text.split(REF_RE);
      const matches = text.match(REF_RE);
      if (!matches) return;

      const frag = document.createDocumentFragment();
      let mi = 0;
      for (let i = 0; i < parts.length; i++) {
        if (parts[i]) frag.appendChild(document.createTextNode(parts[i]));
        if (mi < matches.length) {
          const ref = matches[mi++];
          const key = ref.replace(/\s+/g, " ").toLowerCase();
          const targetPage = index!.get(key);
          if (targetPage != null && targetPage !== currentPage) {
            const a = document.createElement("a");
            a.textContent = ref;
            a.dataset.figLink = "1";
            a.title = `→ p.${targetPage}`;
            a.style.cssText =
              "color:#2563eb;cursor:pointer;text-decoration:underline;text-underline-offset:2px;";
            a.addEventListener("click", (e) => {
              e.preventDefault();
              e.stopPropagation();
              const pageEl = document.querySelector(
                `[data-page-number="${targetPage}"]`,
              );
              if (pageEl) {
                pageEl.scrollIntoView({ behavior: "smooth", block: "start" });
              }
            });
            frag.appendChild(a);
          } else {
            frag.appendChild(document.createTextNode(ref));
          }
        }
      }

      parent.replaceChild(frag, node);
    }

    function traverse(root: Node) {
      const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT,
        null,
      );
      let n: Node | null;
      while ((n = walker.nextNode())) processNode(n);
    }

    const observer = new MutationObserver((mutations) => {
      for (const mut of mutations) {
        for (const node of mut.addedNodes) {
          if (
            node instanceof HTMLElement &&
            (node.classList.contains("textLayer") ||
              node.closest(".textLayer"))
          ) {
            traverse(node);
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Process any text layers already in the DOM.
    document.querySelectorAll(".textLayer").forEach(traverse);

    return () => observer.disconnect();
  }, [captionIndex]);

  return null;
}
