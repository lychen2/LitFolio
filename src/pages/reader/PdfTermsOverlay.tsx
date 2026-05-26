import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

export interface PdfTermEntry {
  term: string;
  definition: string;
}

interface TooltipState {
  x: number;
  y: number;
  term: string;
  definition: string;
}

interface OverlayProps {
  containerRef: RefObject<HTMLElement | null>;
  terms: PdfTermEntry[];
}

interface TermMatchEntry {
  surface: string;
  definition: string;
}

interface TextChunk {
  end: number;
  span: HTMLElement;
  start: number;
  text: string;
  textNode: Text;
}

interface TextPoint {
  chunkIndex: number;
  offset: number;
}

const LAYER_CLASS = "litera-term-layer";
const OVERLAY_CLASS = "litera-term-overlay";

/**
 * In-PDF term decoration without mutating PDF.js's textLayer.
 *
 * For each term occurrence in a rendered text layer we compute its bounding
 * client rects with a `Range` and paint a sibling overlay layer inside the
 * `.page` element. Each overlay div carries the underline visually but has
 * `pointer-events: none` — selection drags through them untouched, which is
 * the regression we hit when we tried wrapping the textLayer spans inline.
 *
 * Hover uses event delegation on the textLayer spans themselves (via a
 * `data-term-tip` attribute) rather than `elementsFromPoint` polling. The
 * earlier polling path conflicted with react-pdf-highlighter's selection
 * layer; `mouseover` bubbles cleanly and doesn't block mousedown drag, so
 * selection keeps working.
 */
export function PdfTermsOverlay({ containerRef, terms }: OverlayProps) {
  const [tip, setTip] = useState<TooltipState | null>(null);
  const termIndex = useRef<Map<string, TermMatchEntry>>(new Map());

  useEffect(() => {
    const map = new Map<string, { surface: string; definition: string }>();
    for (const t of terms) {
      const key = t.term.trim().toLowerCase();
      if (key.length >= 2) map.set(key, { surface: t.term, definition: t.definition });
    }
    termIndex.current = map;
  }, [terms]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || terms.length === 0) return;

    const sortedKeys = [...termIndex.current.keys()].sort((a, b) => b.length - a.length);
    if (sortedKeys.length === 0) return;
    const escaped = sortedKeys.map(patternForTerm).join("|");
    const matcher = new RegExp(`\\b(${escaped})\\b`, "gi");

    const refreshPage = (page: HTMLElement) => {
      const textLayer = page.querySelector(".textLayer");
      if (!(textLayer instanceof HTMLElement)) return;
      let layer = page.querySelector<HTMLElement>(`.${LAYER_CLASS}`);
      if (!layer) {
        layer = document.createElement("div");
        layer.className = LAYER_CLASS;
        page.appendChild(layer);
      } else {
        layer.replaceChildren();
      }
      const chunks = collectTextChunks(textLayer);
      resetSpanTips(chunks);
      if (chunks.length === 0) return;
      const pageRect = page.getBoundingClientRect();
      const pageText = chunks.map((chunk) => chunk.text).join("");
      matcher.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = matcher.exec(pageText)) !== null) {
        const entry = termIndex.current.get(match[0].trim().toLowerCase());
        if (!entry) continue;
        const start = locateStart(chunks, match.index);
        const end = locateEnd(chunks, match.index + match[0].length);
        if (!start || !end) continue;
        paintMatch(layer, pageRect, chunks, start, end);
        attachSpanTips(chunks, start.chunkIndex, end.chunkIndex, match[0], entry.definition);
        if (match.index === matcher.lastIndex) matcher.lastIndex++;
      }
    };

    const refreshAll = () => {
      container.querySelectorAll<HTMLElement>(".page").forEach(refreshPage);
    };
    refreshAll();

    const observer = new MutationObserver((mutations) => {
      const dirty = new Set<HTMLElement>();
      for (const m of mutations) {
        const target = m.target;
        if (!(target instanceof Element)) continue;
        const page = target.closest<HTMLElement>(".page");
        if (!page) continue;
        // We added/removed our own overlays — don't loop on that.
        if (target.classList.contains(LAYER_CLASS)) continue;
        dirty.add(page);
      }
      dirty.forEach(refreshPage);
    });
    observer.observe(container, { childList: true, subtree: true });

    const onOver = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target || typeof target.closest !== "function") return;
      const span = target.closest<HTMLElement>(".textLayer span[data-term-tip]");
      if (!span) {
        setTip((cur) => (cur ? null : cur));
        return;
      }
      const rect = span.getBoundingClientRect();
      const cr = container.getBoundingClientRect();
      setTip({
        x: rect.left - cr.left + rect.width / 2,
        y: rect.top - cr.top,
        term: span.dataset.termSurface ?? "",
        definition: span.dataset.termTip ?? "",
      });
    };
    const onLeave = () => setTip(null);

    container.addEventListener("mouseover", onOver);
    container.addEventListener("mouseleave", onLeave);

    let resizeTimer: number | null = null;
    const onResize = () => {
      if (resizeTimer) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(refreshAll, 200);
    };
    window.addEventListener("resize", onResize);

    return () => {
      observer.disconnect();
      container.removeEventListener("mouseover", onOver);
      container.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("resize", onResize);
      if (resizeTimer) window.clearTimeout(resizeTimer);
      container.querySelectorAll(`.${LAYER_CLASS}`).forEach((el) => el.remove());
    };
  }, [containerRef, terms]);

  if (!tip) return null;
  return (
    <div
      className="litera-term-tooltip pointer-events-none"
      style={{ left: `${tip.x}px`, top: `${tip.y}px` }}
    >
      <div className="text-[11px] uppercase tracking-wider text-litera-mute">{tip.term}</div>
      <div className="mt-1 text-xs leading-relaxed text-litera-text/90">{tip.definition}</div>
    </div>
  );
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function patternForTerm(term: string): string {
  return term
    .trim()
    .split(/\s+/)
    .map(escapeRegex)
    .join("\\s+");
}

function collectTextChunks(textLayer: HTMLElement): TextChunk[] {
  const chunks: TextChunk[] = [];
  let offset = 0;
  textLayer.querySelectorAll<HTMLElement>("span").forEach((span) => {
    const rawNode = span.firstChild;
    if (!rawNode || rawNode.nodeType !== Node.TEXT_NODE) {
      delete span.dataset.termTip;
      delete span.dataset.termSurface;
      return;
    }
    const textNode = rawNode as Text;
    const text = textNode.textContent ?? "";
    if (!text) {
      delete span.dataset.termTip;
      delete span.dataset.termSurface;
      return;
    }
    chunks.push({
      span,
      textNode,
      text,
      start: offset,
      end: offset + text.length,
    });
    offset += text.length;
  });
  return chunks;
}

function resetSpanTips(chunks: TextChunk[]) {
  chunks.forEach(({ span }) => {
    delete span.dataset.termTip;
    delete span.dataset.termSurface;
  });
}

function locateStart(chunks: TextChunk[], index: number): TextPoint | null {
  for (let i = 0; i < chunks.length; i++) {
    if (index < chunks[i].end) {
      return { chunkIndex: i, offset: Math.max(0, index - chunks[i].start) };
    }
  }
  return null;
}

function locateEnd(chunks: TextChunk[], index: number): TextPoint | null {
  for (let i = 0; i < chunks.length; i++) {
    if (index <= chunks[i].end) {
      return { chunkIndex: i, offset: Math.max(0, index - chunks[i].start) };
    }
  }
  return null;
}

function paintMatch(
  layer: HTMLElement,
  pageRect: DOMRect,
  chunks: TextChunk[],
  start: TextPoint,
  end: TextPoint,
) {
  try {
    const range = document.createRange();
    range.setStart(chunks[start.chunkIndex].textNode, start.offset);
    range.setEnd(chunks[end.chunkIndex].textNode, end.offset);
    const rects = range.getClientRects();
    for (let i = 0; i < rects.length; i++) {
      const rect = rects[i];
      if (rect.width === 0 || rect.height === 0) continue;
      const el = document.createElement("div");
      el.className = OVERLAY_CLASS;
      el.style.left = `${rect.left - pageRect.left}px`;
      el.style.top = `${rect.top - pageRect.top}px`;
      el.style.width = `${rect.width}px`;
      el.style.height = `${rect.height}px`;
      layer.appendChild(el);
    }
  } catch {
    /* range failed on unusual textLayer layout — skip */
  }
}

function attachSpanTips(
  chunks: TextChunk[],
  startChunkIndex: number,
  endChunkIndex: number,
  surface: string,
  definition: string,
) {
  for (let i = startChunkIndex; i <= endChunkIndex; i++) {
    const { span } = chunks[i];
    if (span.dataset.termTip) continue;
    span.dataset.termTip = definition;
    span.dataset.termSurface = surface;
  }
}
