import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Loader2 } from "lucide-react";
import { PdfLoader, PdfHighlighter } from "react-pdf-highlighter";
import type {
  IHighlight,
  NewHighlight,
  ScaledPosition,
} from "react-pdf-highlighter";
import type { T_ViewportHighlight } from "react-pdf-highlighter/dist/components/PdfHighlighter";
import "react-pdf-highlighter/dist/style.css";
import "pdfjs-dist/web/pdf_viewer.css";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { api, type Highlight as BackendHighlight } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";
import { PdfTextHighlight } from "./PdfTextHighlight";
import { highlightPalette, highlightTypeKey, type HighlightTypeKey } from "./highlightTypes";
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
import {
  DEFAULT_ZOOM,
  nextZoom,
  wheelZoom,
  ZOOM_STEP,
  type PdfZoom,
} from "./PdfPaneZoom";
import { extractPdfText } from "./pdfTextExtraction";
import {
  pushPdfNavigationPosition,
  shouldRecordPdfNavigation,
  type PdfNavigationPosition,
} from "./pdfNavigationHistory";

type PdfPaneError = {
  stage: "asset-path" | "asset-url" | "pdfjs-load" | "text-cache";
  message: string;
  name?: string;
  detail?: string;
  assetPath?: string;
  assetUrl?: string;
};

type PdfHighlight = IHighlight & {
  label: string | null;
  typeKey: HighlightTypeKey;
};

type ViewportPdfHighlight = T_ViewportHighlight<PdfHighlight>;

type PdfHighlighterApi = {
  handleScaleValue?: () => void;
  renderHighlightLayers?: () => void;
  viewer?: {
    container?: HTMLElement;
  };
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
  paperId,
  scrollRefCb,
  onTranslateSelection,
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
    try {
      return localStorage.getItem("litera.pdf.dark") === "1";
    } catch {
      return false;
    }
  });
  const [searchSignal, setSearchSignal] = useState(0);
  const [zoom, setZoom] = useState<PdfZoom>("page-width");
  const [doiImport, setDoiImport] = useState<string | null>(null);
  const [navigationStack, setNavigationStack] = useState<PdfNavigationPosition[]>([]);
  const scrollFnRef = useRef<((h: PdfHighlight) => void) | null>(null);
  const highlighterRef = useRef<PdfHighlighter<PdfHighlight> | null>(null);
  const pendingScrollIdRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const textPushedRef = useRef<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem("litera.pdf.dark", dark ? "1" : "0");
    } catch {
      /* noop */
    }
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
          if (!cancelled)
            setLoadErr(toPdfPaneError("asset-url", error, { assetPath: path }));
        }
      } catch (e) {
        if (!cancelled) setLoadErr(toPdfPaneError("asset-path", e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [paperId]);

  useEffect(() => {
    setNavigationStack([]);
  }, [paperId, pdfUrl]);

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
      .map((row) => ({
        term: row.term.term,
        definition: row.term.local_definition,
      }))
      .filter((t) => t.term.trim().length >= 2);
  }, [termsQ.data]);

  const create = useMutation({
    mutationFn: (h: NewHighlight) =>
      api.highlightCreate(
        paperId,
        h.position.pageNumber,
        h.position,
        h.content.text ?? ""
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["highlights", paperId] }),
  });

  const addTerm = useMutation({
    mutationFn: (input: { term: string }) =>
      api.paperTermAdd(paperId, input.term, null, null),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["paper-terms", paperId] }),
  });

  // Memoize the highlight derivation so PdfHighlighter's prop reference stays
  // stable across renders that don't actually change the highlight set.
  const highlights: PdfHighlight[] = useMemo(
    () =>
      (highlightsQ.data ?? []).map((h: BackendHighlight) => {
        const label = h.label ?? null;
        return {
          id: h.id,
          position: h.rect as ScaledPosition,
          content: { text: h.text },
          comment: { text: h.note ?? "", emoji: "" },
          label,
          typeKey: highlightTypeKey(label),
        };
      }),
    [highlightsQ.data]
  );

  const renderManualHighlightLayers = useCallback(() => {
    const highlighter = highlighterRef.current as PdfHighlighterApi | null;
    const viewerContainer = highlighter?.viewer?.container;
    if (!viewerContainer) return;

    viewerContainer
      .querySelectorAll(".litera-manual-highlight-layer")
      .forEach((node) => node.remove());

    for (const highlight of highlights) {
      for (const rect of highlight.position.rects ?? []) {
        const pageNumber = rect.pageNumber ?? highlight.position.pageNumber;
        const page = viewerContainer.querySelector<HTMLElement>(
          `.page[data-page-number="${pageNumber}"]`
        );
        if (!page) continue;

        if (getComputedStyle(page).position === "static") {
          page.style.position = "relative";
        }

        let layer = page.querySelector<HTMLElement>(
          ":scope > .litera-manual-highlight-layer"
        );
        if (!layer) {
          layer = document.createElement("div");
          layer.className = "litera-manual-highlight-layer";
          Object.assign(layer.style, {
            position: "absolute",
            inset: "0",
            pointerEvents: "none",
            zIndex: "4",
          });
          page.appendChild(layer);
        }

        const mark = document.createElement("div");
        mark.dataset.highlightId = highlight.id;
        Object.assign(
          mark.style,
          manualHighlightStyle(rect, page, highlight.label, dark)
        );
        layer.appendChild(mark);
      }
    }
  }, [dark, highlights]);

  const scheduleManualHighlightLayers = useCallback(() => {
    renderManualHighlightLayers();
    const frameId = window.requestAnimationFrame(renderManualHighlightLayers);
    const shortId = window.setTimeout(renderManualHighlightLayers, 120);
    const longId = window.setTimeout(renderManualHighlightLayers, 500);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(shortId);
      window.clearTimeout(longId);
    };
  }, [renderManualHighlightLayers]);

  useEffect(() => {
    const highlighter = highlighterRef.current as PdfHighlighterApi | null;
    const cancel = scheduleManualHighlightLayers();
    const intervalId = window.setInterval(renderManualHighlightLayers, 250);
    const stopIntervalId = window.setTimeout(
      () => window.clearInterval(intervalId),
      2500
    );
    return () => {
      cancel();
      window.clearInterval(intervalId);
      window.clearTimeout(stopIntervalId);
      highlighter?.viewer?.container
        ?.querySelectorAll(".litera-manual-highlight-layer")
        .forEach((node) => node.remove());
    };
  }, [renderManualHighlightLayers, scheduleManualHighlightLayers]);
  const pdfScaleValue = zoom === "page-width" ? "page-width" : String(zoom);
  const zoomLabel =
    zoom === "page-width" ? t("reader.zoomFit") : `${Math.round(zoom * 100)}%`;

  const refreshHighlighter = useCallback(() => {
    const highlighter = highlighterRef.current as PdfHighlighterApi | null;
    highlighter?.handleScaleValue?.();
    highlighter?.renderHighlightLayers?.();
  }, []);

  const nudgeHighlightLayers = useCallback(() => {
    refreshHighlighter();
    renderManualHighlightLayers();
    containerRef.current?.dispatchEvent(new Event("scroll", { bubbles: true }));
    window.dispatchEvent(new Event("resize"));
  }, [refreshHighlighter, renderManualHighlightLayers]);

  const scrollContainer = useCallback(() => {
    const highlighter = highlighterRef.current as PdfHighlighterApi | null;
    return highlighter?.viewer?.container ?? containerRef.current;
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (!anchor || !container.contains(anchor)) return;
      if (!shouldRecordPdfNavigation(anchor, pdfUrl)) return;
      const scroller = scrollContainer();
      if (!scroller) return;
      setNavigationStack((current) =>
        pushPdfNavigationPosition(current, { scrollTop: scroller.scrollTop }),
      );
    };
    container.addEventListener("click", handleClick, true);
    return () => container.removeEventListener("click", handleClick, true);
  }, [pdfUrl, scrollContainer]);

  const returnToPreviousPosition = useCallback(() => {
    const scroller = scrollContainer();
    if (!scroller) return;
    setNavigationStack((current) => {
      const previous = current.at(-1);
      if (!previous) return current;
      scroller.scrollTo({ top: previous.scrollTop, behavior: "smooth" });
      return current.slice(0, -1);
    });
  }, [scrollContainer]);

  const scheduleHighlightLayerRefresh = useCallback(() => {
    let secondFrameId = 0;
    const firstFrameId = window.requestAnimationFrame(() => {
      nudgeHighlightLayers();
      secondFrameId = window.requestAnimationFrame(nudgeHighlightLayers);
    });
    const shortTimeoutId = window.setTimeout(nudgeHighlightLayers, 80);
    const layoutTimeoutId = window.setTimeout(nudgeHighlightLayers, 220);
    const fontTimeoutId = window.setTimeout(nudgeHighlightLayers, 500);

    return () => {
      window.cancelAnimationFrame(firstFrameId);
      if (secondFrameId) window.cancelAnimationFrame(secondFrameId);
      window.clearTimeout(shortTimeoutId);
      window.clearTimeout(layoutTimeoutId);
      window.clearTimeout(fontTimeoutId);
    };
  }, [nudgeHighlightLayers]);

  const fallbackScrollToHighlight = useCallback(
    (highlight: PdfHighlight) => {
      const highlighter = highlighterRef.current as PdfHighlighterApi | null;
      const viewerContainer = highlighter?.viewer?.container;
      if (!viewerContainer) return false;

      const page = viewerContainer.querySelector<HTMLElement>(
        `.page[data-page-number="${highlight.position.pageNumber}"]`
      );
      if (!page) return false;

      const rect = highlight.position.boundingRect;
      const top =
        page.offsetTop + (rect.y1 / rect.height) * page.clientHeight - 24;
      viewerContainer.scrollTo({
        top: Math.max(0, top),
        behavior: "smooth",
      });
      renderManualHighlightLayers();
      return true;
    },
    [renderManualHighlightLayers]
  );

  const jumpToHighlight = useCallback(
    (id: string) => {
      const target = highlights.find((h) => h.id === id);
      if (!target || !scrollFnRef.current) {
        pendingScrollIdRef.current = id;
        nudgeHighlightLayers();
        return;
      }
      pendingScrollIdRef.current = null;
      scrollFnRef.current(target);
      window.setTimeout(() => {
        fallbackScrollToHighlight(target);
        nudgeHighlightLayers();
      }, 0);
      window.setTimeout(() => fallbackScrollToHighlight(target), 120);
    },
    [fallbackScrollToHighlight, highlights, nudgeHighlightLayers]
  );

  const flushPendingScroll = useCallback(() => {
    const pendingId = pendingScrollIdRef.current;
    if (!pendingId) return;
    jumpToHighlight(pendingId);
  }, [jumpToHighlight]);

  useEffect(() => {
    const cancelRefresh = scheduleHighlightLayerRefresh();
    const flushTimeoutId = window.setTimeout(flushPendingScroll, 240);
    return () => {
      cancelRefresh();
      window.clearTimeout(flushTimeoutId);
    };
  }, [
    flushPendingScroll,
    highlights,
    pdfScaleValue,
    pdfUrl,
    scheduleHighlightLayerRefresh,
  ]);

  useEffect(() => {
    if (!scrollRefCb) return;
    scrollRefCb(jumpToHighlight);
  }, [scrollRefCb, jumpToHighlight]);

  if (loadErr)
    return (
      <Center>
        <PdfLoadError
          error={loadErr}
          onRetry={() => {
            setLoadErr(null);
            setPdfUrl(null);
          }}
        />
      </Center>
    );
  if (!pdfUrl) {
    return (
      <Center>
        <Loader2 className="h-4 w-4 animate-spin inline mr-1.5" />{" "}
        {t("reader.loadingPdf")}
      </Center>
    );
  }

  return (
    <div
      ref={containerRef}
      className={
        "h-full w-full bg-litera-ink relative " +
        (dark ? "litera-pdf-dark" : "")
      }
      tabIndex={-1}
    >
      <PdfToolbar
        dark={dark}
        zoomLabel={zoomLabel}
        canReturn={navigationStack.length > 0}
        onReturn={returnToPreviousPosition}
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
        beforeLoad={
          <Center>
            <Loader2 className="h-4 w-4 animate-spin inline mr-1.5" />{" "}
            {t("reader.renderingPdf")}
          </Center>
        }
        errorMessage={<PdfLoadError error={loadErr ?? undefined} />}
        onError={(error) => {
          const visibleError = toPdfPaneError("pdfjs-load", error, {
            assetUrl: pdfUrl,
          });
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
              .catch((err) =>
                console.warn(
                  "[PdfPane] push pdf text failed",
                  toPdfPaneError("text-cache", err, { assetUrl: pdfUrl }),
                  err
                )
              );
          }
          return (
            <>
              <PdfHighlighter<PdfHighlight>
                ref={highlighterRef}
                pdfDocument={pdfDocument}
                highlights={highlights}
                enableAreaSelection={(e) => e.altKey}
                pdfScaleValue={pdfScaleValue}
                onScrollChange={() => {
                  /* noop */
                }}
                scrollRef={(fn) => {
                  scrollFnRef.current = fn;
                  scheduleHighlightLayerRefresh();
                  scheduleManualHighlightLayers();
                  window.requestAnimationFrame(flushPendingScroll);
                }}
                onSelectionFinished={(
                  position,
                  content,
                  hideTipAndSelection
                ) => (
                  <SelectionActions
                    onHighlight={() => {
                      create.mutate({
                        position,
                        content,
                        comment: { text: "", emoji: "" },
                      });
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
                highlightTransform={(
                  highlight: ViewportPdfHighlight,
                  _idx,
                  _setTip,
                  _hideTip,
                  _vToScaled,
                  _shot,
                  isScrolledTo
                ) => (
                  <PdfTextHighlight
                    key={highlight.id}
                    rects={highlight.position.rects}
                    dark={dark}
                    isScrolledTo={isScrolledTo}
                    label={highlight.label}
                  />
                )}
              />
              <FigureLinks pdfDocument={pdfDocument} pdfUrl={pdfUrl} />
              <PdfDoiLinkInterceptor
                containerRef={containerRef}
                onDoi={setDoiImport}
              />
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
        <PdfStatusBadge
          highlights={highlightsQ.data.length}
          terms={termEntries.length}
        />
      )}
    </div>
  );
});

function selectedText(content: { text?: string | null }): string {
  const fromHighlighter = content.text?.trim();
  if (fromHighlighter) return fromHighlighter;
  return window.getSelection()?.toString().trim() ?? "";
}

type ManualScaledRect = {
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  left?: number;
  top?: number;
  width: number;
  height: number;
};

function manualHighlightStyle(
  rect: ManualScaledRect,
  page: HTMLElement,
  label: string | null,
  dark: boolean
): Partial<CSSStyleDeclaration> {
  const palette = highlightPalette(label);
  const pageWidth = page.clientWidth || rect.width;
  const pageHeight = page.clientHeight || rect.height;
  const rawLeft = rect.x1 ?? rect.left ?? 0;
  const rawTop = rect.y1 ?? rect.top ?? 0;
  const rawRight = rect.x2 ?? rawLeft + rect.width;
  const rawBottom = rect.y2 ?? rawTop + rect.height;
  const scaleX = pageWidth / rect.width;
  const scaleY = pageHeight / rect.height;
  const verticalInset = Math.min(2.5, Math.max(1, (rawBottom - rawTop) * scaleY * 0.16));

  return {
    position: "absolute",
    left: `${rawLeft * scaleX}px`,
    top: `${rawTop * scaleY + verticalInset}px`,
    width: `${Math.max(2, (rawRight - rawLeft) * scaleX)}px`,
    height: `${Math.max(2, (rawBottom - rawTop) * scaleY - verticalInset * 2)}px`,
    borderRadius: "2px",
    background: dark ? palette.pdfDark : palette.pdf,
    pointerEvents: "none",
  };
}

function toPdfPaneError(
  stage: PdfPaneError["stage"],
  error: unknown,
  context: Pick<PdfPaneError, "assetPath" | "assetUrl"> = {}
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
