import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Highlighter } from "lucide-react";
import {
  PdfLoader, PdfHighlighter, Highlight as RphHighlight, Tip, Popup,
} from "react-pdf-highlighter";
import type { IHighlight, NewHighlight, ScaledPosition } from "react-pdf-highlighter";
import "react-pdf-highlighter/dist/style.css";
import "pdfjs-dist/web/pdf_viewer.css";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { api, type Highlight as BackendHighlight } from "@/lib/api";

/**
 * The middle pane: renders the bound PDF and lets the user highlight text.
 *
 * - Reads the PDF bytes via Tauri's fs plugin (works around webview CSP that
 *   blocks file:// URLs) and feeds them to PDF.js as a blob URL.
 * - Existing highlights are pulled from highlight_list and rendered as
 *   yellow text overlays. Backend stores the full ScaledPosition JSON in
 *   `rect_json` so we can map round-trip without losing precision.
 * - Selecting text → 添加高亮 popup → highlight_create.
 * - Exposes a scroll-to-highlight function to the parent via scrollRefCb.
 */
export function PdfPane({
  paperId, scrollRefCb,
}: {
  paperId: string;
  scrollRefCb?: (fn: (id: string) => void) => void;
}) {
  const qc = useQueryClient();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const scrollFnRef = useRef<((h: IHighlight) => void) | null>(null);

  // Read PDF bytes via Tauri IPC and turn into a Blob URL. We previously tried
  // Tauri's asset:// protocol (convertFileSrc), but on this host PdfLoader's
  // request to that URL silently hangs — no error, no completion. The IPC byte
  // round-trip is slower for very large PDFs (one transfer at open time) but is
  // deterministic and works regardless of capability scope.
  useEffect(() => {
    let cancelled = false;
    let revoke: string | null = null;
    setPdfUrl(null);
    setLoadErr(null);
    (async () => {
      try {
        const bytes = await api.paperReadPdfBytes(paperId);
        if (cancelled) return;
        // Tauri IPC returns number[] for Vec<u8>; convert to Uint8Array.
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

  const highlightsQ = useQuery({
    queryKey: ["highlights", paperId],
    queryFn: () => api.highlightList(paperId),
  });

  const create = useMutation({
    mutationFn: (h: NewHighlight) =>
      api.highlightCreate(paperId, h.position.pageNumber, h.position, h.content.text ?? ""),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["highlights", paperId] }),
  });

  // Map backend rows → library shape. The backend stores the ScaledPosition under `rect`,
  // so the round-trip is just JSON pass-through.
  const highlights: IHighlight[] = (highlightsQ.data ?? []).map((h: BackendHighlight) => ({
    id: h.id,
    position: h.rect as ScaledPosition,
    content: { text: h.text },
    comment: { text: h.note ?? "", emoji: "" },
  }));

  // Wire the parent's onJump → react-pdf-highlighter's internal scroll-to.
  useEffect(() => {
    if (!scrollRefCb) return;
    scrollRefCb((id: string) => {
      const target = highlights.find((h) => h.id === id);
      if (target && scrollFnRef.current) scrollFnRef.current(target);
    });
  }, [scrollRefCb, highlights]);

  if (loadErr) {
    return <Center>✕ 加载 PDF 失败:{loadErr}</Center>;
  }
  if (!pdfUrl) {
    return <Center><Loader2 className="h-4 w-4 animate-spin inline mr-1.5" /> 加载 PDF…</Center>;
  }

  return (
    <div className="h-full w-full bg-litera-ink relative">
      <PdfLoader
        url={pdfUrl}
        workerSrc={workerUrl}
        beforeLoad={<Center><Loader2 className="h-4 w-4 animate-spin inline mr-1.5" /> 渲染中…</Center>}
        errorMessage={<PdfLoadError />}
        onError={(e) => { console.error("[PdfLoader] getDocument failed", e); }}
      >
        {(pdfDocument) => (
          <PdfHighlighter
            pdfDocument={pdfDocument}
            highlights={highlights}
            enableAreaSelection={(e) => e.altKey}
            pdfScaleValue="page-width"
            onScrollChange={() => { /* noop — could clear URL hash here */ }}
            scrollRef={(fn) => { scrollFnRef.current = fn; }}
            onSelectionFinished={(position, content, hideTipAndSelection) => (
              <Tip
                onOpen={() => { /* show comment box if you want comment-on-create */ }}
                onConfirm={() => {
                  create.mutate({
                    position,
                    content,
                    comment: { text: "", emoji: "" },
                  });
                  hideTipAndSelection();
                }}
              />
            )}
            highlightTransform={(highlight, _idx, _setTip, _hideTip, _vToScaled, _shot, isScrolledTo) => (
              <Popup
                popupContent={highlight.comment.text
                  ? <div className="bg-litera-paper border border-litera-line rounded px-2 py-1.5 max-w-[18rem] text-xs text-litera-text leading-relaxed">{highlight.comment.text}</div>
                  : <div />}
                onMouseOver={(c) => c}
                onMouseOut={() => undefined}
                key={highlight.id}
              >
                <RphHighlight
                  isScrolledTo={isScrolledTo}
                  position={highlight.position}
                  comment={highlight.comment}
                />
              </Popup>
            )}
          />
        )}
      </PdfLoader>
      {create.error && (
        <div className="absolute top-2 right-2 text-xs text-red-400/90 bg-litera-paper border border-red-400/30 rounded px-2 py-1 max-w-[24rem]">
          ✕ 创建高亮失败:{(create.error as Error).message}
        </div>
      )}
      {highlightsQ.data && (
        <div className="absolute bottom-2 left-2 text-[11px] text-litera-mute bg-litera-paper/80 border border-litera-line rounded px-2 py-0.5 inline-flex items-center gap-1 pointer-events-none">
          <Highlighter className="h-3 w-3 text-amber-400" />
          {highlightsQ.data.length} 条高亮 · 选中文字后点 ✓ 添加 · Alt+拖拽 区域高亮
        </div>
      )}
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

// RPH's PdfLoader silently returns null on getDocument failure if you don't pass
// errorMessage — that's how this component appeared to "hang at black screen".
// React.cloneElement injects { error } so we can display the actual cause.
function PdfLoadError({ error }: { error?: Error }) {
  return (
    <div className="h-full grid place-items-center text-sm text-red-400/90 p-6 text-center">
      <div>
        <div className="font-medium mb-1">✕ PDF 渲染失败</div>
        <div className="text-xs text-litera-mute font-mono break-all">
          {error?.message || String(error) || "未知错误"}
        </div>
        <div className="text-[11px] text-litera-mute mt-2">
          打开浏览器开发者工具 (F12) 看 console 拿完整错误堆栈。
        </div>
      </div>
    </div>
  );
}
