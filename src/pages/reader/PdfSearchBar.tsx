import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { useT } from "@/i18n/I18nProvider";

interface PdfSearchBarProps {
  containerRef: RefObject<HTMLElement | null>;
  /** External "open the search box" trigger (e.g. Ctrl+F handler in parent). */
  openSignal?: number;
}

const HIT_CLASS = "litera-pdf-find-hit";
const ACTIVE_CLASS = "litera-pdf-find-active";

/**
 * Minimal in-document text search built on top of PDF.js's already-rendered
 * `.textLayer` spans. We walk those spans for substring matches, wrap each hit
 * in a span we own, and let the user step through them. This avoids reaching
 * into PDF.js's PDFFindController (which react-pdf-highlighter doesn't expose)
 * but only sees pages that are currently rendered — fine for a reader where
 * scrolling triggers PDF.js to render nearby pages on demand.
 */
export function PdfSearchBar({ containerRef, openSignal }: PdfSearchBarProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [matchCount, setMatchCount] = useState(0);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const hitsRef = useRef<HTMLElement[]>([]);

  const clearHits = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    container.querySelectorAll(`.${HIT_CLASS}`).forEach((node) => {
      const parent = node.parentNode;
      if (parent) {
        const text = document.createTextNode(node.textContent ?? "");
        parent.replaceChild(text, node);
        parent.normalize();
      }
    });
    hitsRef.current = [];
    setMatchCount(0);
    setActiveIdx(0);
  }, [containerRef]);

  const applySearch = useCallback(
    (raw: string) => {
      clearHits();
      const container = containerRef.current;
      const needle = raw.trim();
      if (!container || needle.length < 2) return;
      const re = new RegExp(escapeRegex(needle), "gi");
      const collected: HTMLElement[] = [];
      container.querySelectorAll<HTMLElement>(".textLayer span").forEach((span) => {
        const text = span.textContent ?? "";
        if (text.length === 0) return;
        re.lastIndex = 0;
        const ranges: Array<{ start: number; end: number }> = [];
        let match: RegExpExecArray | null;
        while ((match = re.exec(text)) !== null) {
          ranges.push({ start: match.index, end: match.index + match[0].length });
          if (match.index === re.lastIndex) re.lastIndex++;
        }
        if (ranges.length === 0) return;
        const frag = document.createDocumentFragment();
        let cursor = 0;
        for (const r of ranges) {
          if (r.start > cursor) {
            frag.appendChild(document.createTextNode(text.slice(cursor, r.start)));
          }
          const hit = document.createElement("span");
          hit.className = HIT_CLASS;
          hit.textContent = text.slice(r.start, r.end);
          frag.appendChild(hit);
          collected.push(hit);
          cursor = r.end;
        }
        if (cursor < text.length) {
          frag.appendChild(document.createTextNode(text.slice(cursor)));
        }
        span.textContent = "";
        span.appendChild(frag);
      });
      hitsRef.current = collected;
      setMatchCount(collected.length);
      setActiveIdx(collected.length > 0 ? 0 : -1);
    },
    [clearHits, containerRef],
  );

  const focusHit = useCallback((idx: number) => {
    const hits = hitsRef.current;
    if (hits.length === 0) return;
    const safe = ((idx % hits.length) + hits.length) % hits.length;
    hits.forEach((h, i) => h.classList.toggle(ACTIVE_CLASS, i === safe));
    hits[safe].scrollIntoView({ behavior: "smooth", block: "center" });
    setActiveIdx(safe);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  useEffect(() => {
    if (openSignal !== undefined && openSignal > 0) setOpen(true);
  }, [openSignal]);

  useEffect(() => {
    if (!open) {
      clearHits();
      return;
    }
    const timer = window.setTimeout(() => applySearch(query), 180);
    return () => window.clearTimeout(timer);
  }, [query, open, applySearch, clearHits]);

  useEffect(() => {
    if (matchCount > 0 && activeIdx >= 0) focusHit(activeIdx);
  }, [matchCount, activeIdx, focusHit]);

  useEffect(() => () => clearHits(), [clearHits]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="absolute top-2 right-[5.25rem] z-20 litera-btn text-xs"
        title={t("reader.searchPdfTitle")}
      >
        <Search className="h-3.5 w-3.5" />
        {t("reader.searchPdf")}
      </button>
    );
  }

  const goNext = () => focusHit(activeIdx + 1);
  const goPrev = () => focusHit(activeIdx - 1);

  return (
    <div className="absolute top-2 right-[5.25rem] z-20 litera-overlay flex items-center gap-1 px-2 py-1 litera-scale-in">
      <Search className="h-3.5 w-3.5 text-litera-mute" />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (e.shiftKey) goPrev();
            else goNext();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setOpen(false);
            setQuery("");
          }
        }}
        placeholder={t("reader.searchPlaceholder")}
        className="litera-input text-xs px-2 py-0.5 w-44"
      />
      <span className="text-[11px] text-litera-mute min-w-[3rem] text-right">
        {matchCount === 0 ? (query ? "0/0" : "—") : `${activeIdx + 1}/${matchCount}`}
      </span>
      <button onClick={goPrev} className="litera-btn text-xs px-1.5 py-0.5" title={t("reader.searchPrev")}>
        <ChevronUp className="h-3 w-3" />
      </button>
      <button onClick={goNext} className="litera-btn text-xs px-1.5 py-0.5" title={t("reader.searchNext")}>
        <ChevronDown className="h-3 w-3" />
      </button>
      <button
        onClick={() => {
          setOpen(false);
          setQuery("");
        }}
        className="litera-btn text-xs px-1.5 py-0.5"
        title={t("reader.searchClose")}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
