import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Highlighter, Minus, Moon, Plus, RotateCcw, Sun } from "lucide-react";
import {
  PdfLoader, PdfHighlighter,
} from "react-pdf-highlighter";
import type { IHighlight, NewHighlight, ScaledPosition } from "react-pdf-highlighter";
import "react-pdf-highlighter/dist/style.css";
import "pdfjs-dist/web/pdf_viewer.css";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { api, type Highlight as BackendHighlight } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";
import { PdfTextHighlight } from "./PdfTextHighlight";
import { PdfTermsOverlay, type PdfTermEntry } from "./PdfTermsOverlay";
import { PdfSearchBar } from "./PdfSearchBar";
import { FigureLinks } from "./FigureLinks";
import { PdfDoiImportDialog } from "./PdfDoiImportDialog";
import { PdfDoiLinkInterceptor } from "./PdfDoiLinkInterceptor";

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 2.4;
const ZOOM_STEP = 0.15;
const WHEEL_ZOOM_FACTOR = 0.0015;
const DEFAULT_ZOOM = 1;

/**
 * The middle pane: renders the bound PDF and lets the user highlight, search,
 * translate, and mark terms inside the document.
 *
 * - Reads the PDF bytes via Tauri's fs plugin (works around webview CSP that
 *   blocks file:// URLs) and feeds them to PDF.js as a blob URL.
 * - Existing highlights are pulled from highlight_list and rendered as
 *   yellow text overlays. Backend stores the full ScaledPosition JSON in
 *   `rect_json` so we can map round-trip without losing precision.
 * - Selecting text → 添加高亮 / 翻译选段 / 添加术语 popup.
 * - Stored terms get an underlined inline mark + hover tooltip via
 *   `PdfTermsOverlay`.
 * - Ctrl+F (or the search button) opens an in-document text find.
 */
export const PdfPane = memo(function PdfPane({
  paperId, scrollRefCb, onTranslateSelection,
}: {
  paperId: string;
  scrollRefCb?: (fn: (id: string) => void) => void;
  onTranslateSelection?: (text: string) => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [dark, setDark] = useState<boolean>(() => {
    try { return localStorage.getItem("litera.pdf.dark") === "1"; }
    catch { return false; }
  });
  const [searchSignal, setSearchSignal] = useState(0);
  const [zoom, setZoom] = useState<number | "page-width">("page-width");
  const [doiImport, setDoiImport] = useState<string | null>(null);
  const scrollFnRef = useRef<((h: IHighlight) => void) | null>(null);
  const highlighterRef = useRef<PdfHighlighter<IHighlight> | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const textPushedRef = useRef<string | null>(null);

  useEffect(() => {
    try { localStorage.setItem("litera.pdf.dark", dark ? "1" : "0"); } catch { /* noop */ }
  }, [dark]);

  useEffect(() => {
    let cancelled = false;
    let revoke: string | null = null;
    setPdfUrl(null);
    setLoadErr(null);
    (async () => {
      try {
        const bytes = await api.paperReadPdfBytes(paperId);
        if (cancelled) return;
        const arr = new Uint8Array(bytes);
        const blob = new Blob([arr], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        revoke = url;
        setPdfUrl(url);
      } catch (e) {
        if (!cancelled) setLoadErr((e as Error).message);
      }
    })();
    return () => { cancelled = true; if (revoke) URL.revokeObjectURL(revoke); };
  }, [paperId]);

  // Ctrl+F → open the search bar. Only fires when the PDF pane has the
  // intent (i.e. the keystroke happened inside our container, not while
  // typing in the notes pane).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as Node | null;
      const insidePdf = target && containerRef.current?.contains(target);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        if (insidePdf) {
          e.preventDefault();
          setSearchSignal((n) => n + 1);
        }
        return;
      }
      if (!insidePdf || !(e.ctrlKey || e.metaKey)) return;
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        setZoom((current) => nextZoom(current, ZOOM_STEP));
      } else if (e.key === "-") {
        e.preventDefault();
        setZoom((current) => nextZoom(current, -ZOOM_STEP));
      } else if (e.key === "0") {
        e.preventDefault();
        setZoom(DEFAULT_ZOOM);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((current) => wheelZoom(current, e.deltaY));
    };
    container.addEventListener("wheel", handler, { passive: false });
    return () => container.removeEventListener("wheel", handler);
  }, [pdfUrl]);

  const highlightsQ = useQuery({
    queryKey: ["highlights", paperId],
    queryFn: () => api.highlightList(paperId),
  });

  const termsQ = useQuery({
    queryKey: ["paper-terms", paperId],
    queryFn: () => api.paperTermsList(paperId),
  });

  const termEntries: PdfTermEntry[] = useMemo(() => {
    return (termsQ.data ?? [])
      .map((row) => ({ term: row.term.term, definition: row.term.local_definition }))
      .filter((t) => t.term.trim().length >= 2);
  }, [termsQ.data]);

  const create = useMutation({
    mutationFn: (h: NewHighlight) =>
      api.highlightCreate(paperId, h.position.pageNumber, h.position, h.content.text ?? ""),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["highlights", paperId] }),
  });

  const addTerm = useMutation({
    mutationFn: (input: { term: string }) =>
      api.paperTermAdd(paperId, input.term, null, null),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["paper-terms", paperId] }),
  });

  // Memoize the IHighlight[] derivation so PdfHighlighter's prop reference
  // stays stable across renders that don't actually change the highlight set.
  // Without this, every parent re-render forced PdfHighlighter to diff the
  // array from scratch.
  const highlights: IHighlight[] = useMemo(
    () =>
      (highlightsQ.data ?? []).map((h: BackendHighlight) => ({
        id: h.id,
        position: h.rect as ScaledPosition,
        content: { text: h.text },
        comment: { text: h.note ?? "", emoji: "" },
      })),
    [highlightsQ.data],
  );
  const pdfScaleValue = zoom === "page-width" ? "page-width" : String(zoom);
  const zoomLabel = zoom === "page-width" ? t("reader.zoomFit") : `${Math.round(zoom * 100)}%`;

  useEffect(() => {
    highlighterRef.current?.handleScaleValue?.();
  }, [pdfScaleValue]);

  useEffect(() => {
    if (!scrollRefCb) return;
    scrollRefCb((id: string) => {
      const target = highlights.find((h) => h.id === id);
      if (target && scrollFnRef.current) scrollFnRef.current(target);
    });
  }, [scrollRefCb, highlights]);

  if (loadErr) return <Center><PdfLoadError error={new Error(loadErr)} onRetry={() => { setLoadErr(null); setPdfUrl(null); }} /></Center>;
  if (!pdfUrl) {
    return <Center><Loader2 className="h-4 w-4 animate-spin inline mr-1.5" /> {t("reader.loadingPdf")}</Center>;
  }

  return (
    <div
      ref={containerRef}
      className={"h-full w-full bg-litera-ink relative " + (dark ? "litera-pdf-dark" : "")}
      tabIndex={-1}
    >
      <div className="absolute top-2 left-2 z-20 litera-overlay flex items-center gap-1 px-1.5 py-1">
        <button
          onClick={() => setZoom((current) => nextZoom(current, -ZOOM_STEP))}
          className="litera-btn text-xs px-1.5 py-0.5"
          title={t("reader.zoomOutTitle")}
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => setZoom(DEFAULT_ZOOM)}
          className="litera-btn text-[11px] px-2 py-0.5 min-w-12 justify-center"
          title={t("reader.zoomResetTitle")}
        >
          {zoomLabel}
        </button>
        <button
          onClick={() => setZoom((current) => nextZoom(current, ZOOM_STEP))}
          className="litera-btn text-xs px-1.5 py-0.5"
          title={t("reader.zoomInTitle")}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => setZoom("page-width")}
          className="litera-btn text-xs px-1.5 py-0.5"
          title={t("reader.zoomFitTitle")}
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>
      <PdfSearchBar containerRef={containerRef} openSignal={searchSignal} />
      <button
        onClick={() => setDark((d) => !d)}
        className="absolute top-2 right-2 z-20 litera-btn text-xs"
        title={dark ? t("reader.lightModeTitle") : t("reader.darkModeTitle")}
      >
        {dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        {dark ? t("reader.lightMode") : t("reader.darkMode")}
      </button>
      <PdfLoader
        url={pdfUrl}
        workerSrc={workerUrl}
        beforeLoad={<Center><Loader2 className="h-4 w-4 animate-spin inline mr-1.5" /> {t("reader.renderingPdf")}</Center>}
        errorMessage={<PdfLoadError />}
        onError={(e) => { console.error("[PdfLoader] getDocument failed", e); }}
      >
        {(pdfDocument) => {
          // pdfjs gives us reliable body text. lopdf in the backend chokes on
          // many modern academic PDFs (CMap fonts, font subsets), so we push
          // the renderer's extraction up to the backend cache once per paper
          // load. The text feeds the term extractor's corpus so acronyms that
          // only live in the body (LSF / RAG / CST / …) get picked up.
          if (textPushedRef.current !== paperId) {
            textPushedRef.current = paperId;
            extractPdfText(pdfDocument)
              .then((text) => {
                if (!text) return;
                return api.paperSetPdfText(paperId, text);
              })
              .catch((err) => console.warn("[PdfPane] push pdf text failed", err));
          }
          return (
            <>
              <PdfHighlighter
                ref={highlighterRef}
                pdfDocument={pdfDocument}
                highlights={highlights}
                enableAreaSelection={(e) => e.altKey}
                pdfScaleValue={pdfScaleValue}
                onScrollChange={() => { /* noop */ }}
                scrollRef={(fn) => { scrollFnRef.current = fn; }}
                onSelectionFinished={(position, content, hideTipAndSelection) => (
                  <SelectionActions
                    onHighlight={() => {
                      create.mutate({ position, content, comment: { text: "", emoji: "" } });
                      hideTipAndSelection();
                    }}
                    onTranslate={() => {
                      const text = content.text?.trim();
                      if (text) onTranslateSelection?.(text);
                      hideTipAndSelection();
                    }}
                    onAddTerm={() => {
                      const text = content.text?.trim();
                      if (text) addTerm.mutate({ term: text });
                      hideTipAndSelection();
                    }}
                    pending={addTerm.isPending}
                  />
                )}
                highlightTransform={(highlight, _idx, _setTip, _hideTip, _vToScaled, _shot, isScrolledTo) => (
                  <PdfTextHighlight
                    key={highlight.id}
                    rects={highlight.position.rects}
                    dark={dark}
                    isScrolledTo={isScrolledTo}
                  />
                )}
              />
              <FigureLinks pdfDocument={pdfDocument} pdfUrl={pdfUrl} />
              <PdfDoiLinkInterceptor containerRef={containerRef} onDoi={setDoiImport} />
            </>
          );
        }}
      </PdfLoader>
      <PdfDoiImportDialog
        doi={doiImport}
        sourcePaperId={paperId}
        onClose={() => setDoiImport(null)}
      />
      <PdfTermsOverlay containerRef={containerRef} terms={termEntries} />
      {(create.error || addTerm.error) && (
        <div className="absolute top-2 right-2 text-xs text-red-400/90 bg-litera-paper border border-red-400/30 rounded px-2 py-1 max-w-[24rem] flex items-center gap-2">
          <span>✕ {(create.error as Error | undefined)?.message || (addTerm.error as Error | undefined)?.message}</span>
          <button
            onClick={() => { if (create.error) create.reset(); if (addTerm.error) addTerm.reset(); }}
            className="text-litera-mute hover:text-litera-text transition-colors"
          >
            {t("common.retry")}
          </button>
        </div>
      )}
      {highlightsQ.data && (
        <div className="absolute bottom-2 left-2 text-[11px] text-litera-mute bg-litera-paper/80 border border-litera-line rounded px-2 py-0.5 inline-flex items-center gap-2 pointer-events-none">
          <span className="inline-flex items-center gap-1">
            <Highlighter className="h-3 w-3 text-amber-400" />
            {highlightsQ.data.length} {t("reader.highlights")}
          </span>
          <span>·</span>
          <span>{termEntries.length} {t("reader.terms")}</span>
        </div>
      )}
    </div>
  );
});

function SelectionActions({
  onHighlight,
  onTranslate,
  onAddTerm,
  pending,
}: {
  onHighlight: () => void;
  onTranslate: () => void;
  onAddTerm: () => void;
  pending: boolean;
}) {
  const t = useT();
  return (
    <div className="litera-overlay p-1.5 flex items-center gap-1.5 litera-slide-up">
      <button onClick={onHighlight} className="litera-btn-primary text-xs px-2 py-1">
        {t("reader.addHighlight")}
      </button>
      <button onClick={onTranslate} className="litera-btn text-xs px-2 py-1">
        {t("reader.translateSelection")}
      </button>
      <button
        onClick={onAddTerm}
        disabled={pending}
        className="litera-btn text-xs px-2 py-1"
      >
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
        {t("reader.addTerm")}
      </button>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full grid place-items-center text-sm text-litera-mute">
      <div>{children}</div>
    </div>
  );
}

function PdfLoadError({ error, onRetry }: { error?: Error; onRetry?: () => void }) {
  const t = useT();
  return (
    <div className="h-full grid place-items-center text-sm text-red-400/90 p-6 text-center">
      <div>
        <div className="font-medium mb-1">✕ {t("reader.pdfRenderFailed")}</div>
        <div className="text-xs text-litera-mute font-mono break-all">
          {error?.message || String(error) || t("reader.unknownError")}
        </div>
        {onRetry && (
          <button onClick={onRetry} className="litera-btn text-xs px-3 py-1 mt-3">
            {t("common.retry")}
          </button>
        )}
        <div className="text-[11px] text-litera-mute mt-2">
          {t("reader.openConsole")}
        </div>
      </div>
    </div>
  );
}

function nextZoom(current: number | "page-width", delta: number): number {
  const base = current === "page-width" ? DEFAULT_ZOOM : current;
  const value = Math.round((base + delta) * 100) / 100;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function wheelZoom(current: number | "page-width", deltaY: number): number {
  const base = current === "page-width" ? DEFAULT_ZOOM : current;
  const value = base * Math.exp(-deltaY * WHEEL_ZOOM_FACTOR);
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

/** Walk every page and concatenate its text via pdfjs's getTextContent API. */
async function extractPdfText(pdfDocument: {
  numPages: number;
  getPage(n: number): Promise<unknown>;
}): Promise<string> {
  const out: string[] = [];
  for (let i = 1; i <= pdfDocument.numPages; i++) {
    try {
      const page = (await pdfDocument.getPage(i)) as { getTextContent(): Promise<{ items: unknown[] }> };
      const content = await page.getTextContent();
      const buf: string[] = [];
      for (const raw of content.items) {
        const item = raw as { str?: string; hasEOL?: boolean };
        if (typeof item.str === "string") buf.push(item.str);
        if (item.hasEOL) buf.push("\n");
      }
      out.push(buf.join(" "));
    } catch (err) {
      console.warn(`[PdfPane] getTextContent page ${i} failed`, err);
    }
  }
  return out.join("\n\n");
}
