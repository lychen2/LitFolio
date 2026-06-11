import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Loader2 } from "lucide-react";
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
import {
  Center,
  PdfLoadError,
  PdfMutationError,
  PdfStatusBadge,
  PdfToolbar,
  SelectionActions,
} from "./PdfPaneChrome";
import { DEFAULT_ZOOM, nextZoom, wheelZoom, ZOOM_STEP, type PdfZoom } from "./PdfPaneZoom";
import { extractPdfText } from "./pdfTextExtraction";

type PdfPaneError = {
  stage: "asset-path" | "asset-url" | "pdfjs-load" | "text-cache";
  message: string;
  name?: string;
  detail?: string;
  assetPath?: string;
  assetUrl?: string;
};

/**
 * The middle pane: renders the bound PDF and lets the user highlight, search,
 * translate, and mark terms inside the document.
 *
 * - Feeds PDF.js a Tauri asset URL so large PDFs do not cross the invoke IPC
 *   boundary as a serialized byte array.
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
  const [loadErr, setLoadErr] = useState<PdfPaneError | null>(null);
  const [dark, setDark] = useState<boolean>(() => {
    try { return localStorage.getItem("litera.pdf.dark") === "1"; }
    catch { return false; }
  });
  const [searchSignal, setSearchSignal] = useState(0);
  const [zoom, setZoom] = useState<PdfZoom>("page-width");
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
    setPdfUrl(null);
    setLoadErr(null);
    (async () => {
      try {
        const path = await api.paperPdfAssetPath(paperId);
        if (cancelled) return;
        try {
          const assetUrl = convertFileSrc(path);
          setPdfUrl(assetUrl);
        } catch (error) {
          if (!cancelled) setLoadErr(toPdfPaneError("asset-url", error, { assetPath: path }));
        }
      } catch (e) {
        if (!cancelled) setLoadErr(toPdfPaneError("asset-path", e));
      }
    })();
    return () => { cancelled = true; };
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

  if (loadErr) return <Center><PdfLoadError error={loadErr} onRetry={() => { setLoadErr(null); setPdfUrl(null); }} /></Center>;
  if (!pdfUrl) {
    return <Center><Loader2 className="h-4 w-4 animate-spin inline mr-1.5" /> {t("reader.loadingPdf")}</Center>;
  }

  return (
    <div
      ref={containerRef}
      className={"h-full w-full bg-litera-ink relative " + (dark ? "litera-pdf-dark" : "")}
      tabIndex={-1}
    >
      <PdfToolbar
        dark={dark}
        zoomLabel={zoomLabel}
        onZoomOut={() => setZoom((current) => nextZoom(current, -ZOOM_STEP))}
        onZoomReset={() => setZoom(DEFAULT_ZOOM)}
        onZoomIn={() => setZoom((current) => nextZoom(current, ZOOM_STEP))}
        onZoomFit={() => setZoom("page-width")}
        onToggleDark={() => setDark((d) => !d)}
      />
      <PdfSearchBar containerRef={containerRef} openSignal={searchSignal} />
      <PdfLoader
        url={pdfUrl}
        workerSrc={workerUrl}
        beforeLoad={<Center><Loader2 className="h-4 w-4 animate-spin inline mr-1.5" /> {t("reader.renderingPdf")}</Center>}
        errorMessage={<PdfLoadError error={loadErr ?? undefined} />}
        onError={(error) => {
          const visibleError = toPdfPaneError("pdfjs-load", error, { assetUrl: pdfUrl });
          console.error("[PdfLoader] getDocument failed", visibleError, error);
          setLoadErr(visibleError);
        }}
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
              .catch((err) => console.warn(
                "[PdfPane] push pdf text failed",
                toPdfPaneError("text-cache", err, { assetUrl: pdfUrl }),
                err,
              ));
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
                    onCopy={() => {
                      const text = selectedText(content);
                      if (text) void navigator.clipboard.writeText(text);
                      hideTipAndSelection();
                    }}
                    onTranslate={() => {
                      const text = selectedText(content);
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
      <PdfMutationError
        createError={create.error}
        termError={addTerm.error}
        onRetry={() => {
          if (create.error) create.reset();
          if (addTerm.error) addTerm.reset();
        }}
      />
      {highlightsQ.data && (
        <PdfStatusBadge highlights={highlightsQ.data.length} terms={termEntries.length} />
      )}
    </div>
  );
});

function selectedText(content: { text?: string | null }): string {
  const fromHighlighter = content.text?.trim();
  if (fromHighlighter) return fromHighlighter;
  return window.getSelection()?.toString().trim() ?? "";
}

function toPdfPaneError(
  stage: PdfPaneError["stage"],
  error: unknown,
  context: Pick<PdfPaneError, "assetPath" | "assetUrl"> = {},
): PdfPaneError {
  if (error instanceof Error) {
    return {
      stage,
      name: error.name,
      message: error.message || String(error),
      detail: error.stack,
      ...context,
    };
  }
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    return {
      stage,
      name: stringValue(record.name),
      message: stringValue(record.message) || stringifyError(error),
      detail: stringifyError(error),
      ...context,
    };
  }
  return {
    stage,
    message: String(error || "Unknown PDF error"),
    ...context,
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function stringifyError(error: unknown): string {
  try {
    return JSON.stringify(error, Object.getOwnPropertyNames(error), 2);
  } catch {
    return String(error);
  }
}
