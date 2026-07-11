import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { Loader2, MessageSquare, Trash2, Type } from "lucide-react";
import type { ScaledPosition } from "react-pdf-highlighter";
import { useT } from "@/i18n/I18nProvider";
import { PdfLinkedNoteBox } from "./PdfLinkedNoteBox";
import {
  createStandalonePdfNotePosition,
  highlightNoteUpdateValue,
  nextLinkedPdfNoteDraft,
  nextPdfNoteFontSize,
  pdfNoteFontSizeBase,
  pdfNoteFontSizePx,
  visiblePdfNoteText,
} from "./pdfSelectionHelpers";

const MIN_NOTE_SIZE = 20;
const DEFAULT_NOTE_WIDTH = 220;
const DEFAULT_NOTE_HEIGHT = 120;

type OverlayRect = {
  top: number;
  left: number;
  width: number;
  height: number;
  scale: number;
};

type OverlayHighlight = {
  id: string;
  note: string | null;
  position: ScaledPosition & { noteFontSize?: number };
};

export type NoteDragStart = {
  pageNumber: number;
  pageWidth: number;
  pageHeight: number;
  x: number;
  y: number;
};

export type ViewportDraftRect = NoteDragStart & {
  x2: number;
  y2: number;
};

type PdfMarginNotesOverlayProps = {
  activeNoteId: string | null;
  containerRef: RefObject<HTMLElement>;
  draftRect: ViewportDraftRect | null;
  hiddenLinkedNoteIds: Set<string>;
  linkedNotes: OverlayHighlight[];
  marginNotes: OverlayHighlight[];
  noteDrawMode: boolean;
  onCancelDraft: () => void;
  onCreate: (position: ScaledPosition & { noteFontSize?: number }) => Promise<void>;
  onDelete: (highlightId: string) => Promise<void>;
  onDragStart: (start: NoteDragStart) => void;
  onDraftRect: (rect: ViewportDraftRect) => void;
  onHideLinkedNote: (id: string) => void;
  onSave: (highlightId: string, draft: string) => Promise<void>;
  onSelect: (id: string | null) => void;
  onToggleDrawMode: (enabled: boolean) => void;
  onUpdatePosition: (highlightId: string, position: ScaledPosition & { noteFontSize?: number }) => Promise<void>;
};

type PageRect = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

type NoteAdjustMode = "move" | "resize";

type PositionedNote = {
  note: OverlayHighlight;
  rect: OverlayRect;
};

export function PdfMarginNotesOverlay({
  activeNoteId,
  containerRef,
  draftRect,
  hiddenLinkedNoteIds,
  linkedNotes,
  marginNotes,
  noteDrawMode,
  onCancelDraft,
  onCreate,
  onDelete,
  onDragStart,
  onDraftRect,
  onHideLinkedNote,
  onSave,
  onSelect,
  onToggleDrawMode,
  onUpdatePosition,
}: PdfMarginNotesOverlayProps) {
  const t = useT();
  const [layoutVersion, setLayoutVersion] = useState(0);
  const [pendingPositions, setPendingPositions] = useState<Record<string, ScaledPosition & { noteFontSize?: number }>>({});

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const bump = () => setLayoutVersion((version) => version + 1);
    const observer = new ResizeObserver(bump);
    container.addEventListener("scroll", bump, true);
    window.addEventListener("resize", bump);
    observer.observe(container);
    container.querySelectorAll<HTMLElement>(".page[data-page-number]").forEach((page) => observer.observe(page));
    bump();
    return () => {
      container.removeEventListener("scroll", bump, true);
      window.removeEventListener("resize", bump);
      observer.disconnect();
    };
  }, [containerRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !noteDrawMode) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".litera-pdf-note-box, .litera-pdf-note-text, .litera-overlay, button, input, textarea, select, [contenteditable='true']")) return;
      const page = target.closest<HTMLElement>(".page[data-page-number]");
      if (!page || !container.contains(page)) return;
      const start = pagePoint(event, page);
      if (!start) return;
      event.preventDefault();
      event.stopPropagation();

      let current: ViewportDraftRect = { ...start, x2: start.x, y2: start.y };
      onDragStart(start);
      onDraftRect(current);

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const point = pagePoint(moveEvent, page);
        if (!point) return;
        current = { ...start, x2: point.x, y2: point.y };
        onDraftRect(current);
      };

      const handlePointerCancel = () => {
        cleanup();
        onCancelDraft();
      };

      const handlePointerUp = () => {
        cleanup();
        const position = createStandalonePdfNotePosition({
          pageNumber: current.pageNumber,
          pageWidth: current.pageWidth,
          pageHeight: current.pageHeight,
          rect: noteRectFromDrag(current),
        });
        void onCreate(position).catch(() => undefined);
      };

      function cleanup() {
        window.removeEventListener("pointermove", handlePointerMove, true);
        window.removeEventListener("pointerup", handlePointerUp, true);
        window.removeEventListener("pointercancel", handlePointerCancel, true);
      }

      window.addEventListener("pointermove", handlePointerMove, true);
      window.addEventListener("pointerup", handlePointerUp, true);
      window.addEventListener("pointercancel", handlePointerCancel, true);
    };

    container.addEventListener("pointerdown", handlePointerDown, true);
    return () => container.removeEventListener("pointerdown", handlePointerDown, true);
  }, [containerRef, noteDrawMode, onCancelDraft, onCreate, onDragStart, onDraftRect]);

  useEffect(() => {
    if (!activeNoteId) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".litera-pdf-page-note-editor, .litera-pdf-note-text, .litera-pdf-note-box")) return;
      onSelect(null);
    };
    window.addEventListener("pointerdown", handlePointerDown, true);
    return () => window.removeEventListener("pointerdown", handlePointerDown, true);
  }, [activeNoteId, onSelect]);

  const linkedNoteBoxes = useMemo(() => {
    void layoutVersion;
    return linkedNotes
      .filter((note) => activeNoteId === note.id || (!!note.note && !hiddenLinkedNoteIds.has(note.id)))
      .map((note) => {
        const rect = positionRect(containerRef.current, note.position.boundingRect, note.position.pageNumber);
        return rect ? { note, rect } : null;
      })
      .filter((item): item is PositionedNote => item !== null);
  }, [activeNoteId, containerRef, hiddenLinkedNoteIds, layoutVersion, linkedNotes]);

  const marginNoteBoxes = useMemo(() => {
    void layoutVersion;
    return marginNotes
      .map((note) => ({ ...note, position: pendingPositions[note.id] ?? note.position }))
      .map((note) => {
        const rect = positionRect(containerRef.current, note.position.boundingRect, note.position.pageNumber);
        return rect ? { note, rect } : null;
      })
      .filter((item): item is PositionedNote => item !== null);
  }, [containerRef, layoutVersion, marginNotes, pendingPositions]);

  const draftOverlayRect = draftRect ? draftRectToOverlayRect(containerRef.current, draftRect) : null;

  function startNoteAdjustment(note: OverlayHighlight, mode: NoteAdjustMode, event: ReactPointerEvent) {
    if (event.button !== 0) return;
    const container = containerRef.current;
    if (!container) return;
    const page = pageForPosition(container, note.position.pageNumber);
    if (!page) return;
    const start = pagePoint(event.nativeEvent, page);
    if (!start) return;
    const original = rectToPageRect(note.position.boundingRect);
    let nextPosition: (ScaledPosition & { noteFontSize?: number }) | null = null;
    event.preventDefault();
    event.stopPropagation();

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const point = pagePoint(moveEvent, page);
      if (!point) return;
      const rect = mode === "move"
        ? moveRect(original, point.x - start.x, point.y - start.y, start.pageWidth, start.pageHeight)
        : resizeRect(original, point.x, point.y, start.pageWidth, start.pageHeight);
      nextPosition = {
        ...createStandalonePdfNotePosition({
          pageNumber: start.pageNumber,
          pageWidth: start.pageWidth,
          pageHeight: start.pageHeight,
          rect,
        }),
        noteFontSize: note.position.noteFontSize,
      };
      setPendingPositions((current) => ({ ...current, [note.id]: nextPosition as ScaledPosition & { noteFontSize?: number } }));
    };

    const handlePointerCancel = () => {
      cleanup();
      setPendingPositions((current) => omitKey(current, note.id));
    };

    const handlePointerUp = () => {
      cleanup();
      if (!nextPosition) return;
      void onUpdatePosition(note.id, nextPosition)
        .then(() => setPendingPositions((current) => omitKey(current, note.id)))
        .catch(() => setPendingPositions((current) => omitKey(current, note.id)));
    };

    function cleanup() {
      window.removeEventListener("pointermove", handlePointerMove, true);
      window.removeEventListener("pointerup", handlePointerUp, true);
      window.removeEventListener("pointercancel", handlePointerCancel, true);
    }

    window.addEventListener("pointermove", handlePointerMove, true);
    window.addEventListener("pointerup", handlePointerUp, true);
    window.addEventListener("pointercancel", handlePointerCancel, true);
  }

  return (
    <div className="absolute inset-0 z-[19] pointer-events-none">
      {noteDrawMode && (
        <button
          type="button"
          className="litera-pdf-note-draw-cancel litera-btn text-xs"
          onClick={() => {
            onCancelDraft();
            onToggleDrawMode(false);
          }}
        >
          {t("common.cancel")}
        </button>
      )}
      {draftOverlayRect && <div className="litera-pdf-note-draft" style={draftOverlayRect} />}
      {linkedNoteBoxes.map(({ note, rect }) => (
        <PdfLinkedNoteBox
          key={`${note.id}:linked-note`}
          highlightId={note.id}
          note={note.note}
          rects={[rect]}
          active={activeNoteId === note.id}
          onSave={onSave}
          onClose={() => onHideLinkedNote(note.id)}
        />
      ))}
      {marginNoteBoxes.map(({ note, rect }) => (
        <PdfPageNoteBox
          key={`${note.id}:margin-note`}
          note={note}
          active={activeNoteId === note.id}
          rect={rect}
          onDelete={onDelete}
          onSave={onSave}
          onSelect={() => onSelect(note.id)}
          onFontSize={(highlightId, fontSize) => {
            const nextPosition = { ...note.position, noteFontSize: fontSize };
            setPendingPositions((current) => ({ ...current, [highlightId]: nextPosition }));
            return onUpdatePosition(highlightId, nextPosition);
          }}
          onStartAdjust={startNoteAdjustment}
        />
      ))}
    </div>
  );
}

type PageNoteState = {
  highlightId: string;
  draft: string;
  saved: string;
};

type PdfPageNoteBoxProps = {
  note: OverlayHighlight;
  active: boolean;
  rect: OverlayRect;
  onDelete: (highlightId: string) => Promise<void>;
  onFontSize: (highlightId: string, fontSize: number) => Promise<void>;
  onSave: (highlightId: string, draft: string) => Promise<void>;
  onSelect: () => void;
  onStartAdjust: (note: OverlayHighlight, mode: NoteAdjustMode, event: ReactPointerEvent) => void;
};

function PdfPageNoteBox({ note, active, rect, onDelete, onFontSize, onSave, onSelect, onStartAdjust }: PdfPageNoteBoxProps) {
  const t = useT();
  const [state, setState] = useState<PageNoteState>(() => ({
    highlightId: note.id,
    draft: note.note ?? "",
    saved: note.note ?? "",
  }));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const saveSeqRef = useRef(0);

  useEffect(() => {
    setState((current) => {
      if (current.highlightId !== note.id) {
        return { highlightId: note.id, draft: note.note ?? "", saved: note.note ?? "" };
      }
      const dirty = current.draft !== current.saved;
      return {
        highlightId: note.id,
        draft: nextLinkedPdfNoteDraft({
          currentDraft: current.draft,
          incomingNote: note.note,
          dirty,
        }),
        saved: dirty ? current.saved : note.note ?? "",
      };
    });
  }, [note.id, note.note]);

  useEffect(() => {
    if (!active) return;
    textareaRef.current?.focus();
  }, [active, note.id]);

  useEffect(() => {
    if (state.draft === state.saved) return;
    const draftToSave = state.draft;
    const timeoutId = window.setTimeout(() => {
      const saveSeq = saveSeqRef.current + 1;
      saveSeqRef.current = saveSeq;
      setSaving(true);
      setSaveError(null);
      onSave(note.id, draftToSave)
        .then(() => {
          const normalized = highlightNoteUpdateValue(draftToSave) ?? "";
          setState((current) =>
            current.highlightId === note.id
              ? {
                  ...current,
                  draft: current.draft === draftToSave ? normalized : current.draft,
                  saved: normalized,
                }
              : current,
          );
        })
        .catch((error: unknown) => {
          if (saveSeqRef.current !== saveSeq) return;
          setSaveError(error instanceof Error ? error.message : String(error));
        })
        .finally(() => {
          if (saveSeqRef.current === saveSeq) setSaving(false);
        });
    }, 800);
    return () => window.clearTimeout(timeoutId);
  }, [note.id, onSave, state.draft, state.saved]);

  const status = saveError
    ? `${t("reader.saveFailed")}: ${saveError}`
    : saving
      ? t("reader.saving")
      : state.draft === state.saved
        ? t("reader.saved")
        : t("reader.unsaved");
  const fontSize = pdfNoteFontSizeBase(note.position);

  function updateFontSize(delta: number) {
    void onFontSize(note.id, nextPdfNoteFontSize(fontSize, delta));
  }

  function stopPdfEvent(event: ReactMouseEvent) {
    event.stopPropagation();
  }

  if (!active) {
    const text = visiblePdfNoteText(state.draft);
    if (!text) return null;
    return (
      <button
        type="button"
        className="litera-pdf-note-text"
        style={pageNoteTextStyle(rect, fontSize)}
        onClick={(event) => {
          stopPdfEvent(event);
          onSelect();
        }}
        onMouseDown={stopPdfEvent}
      >
        {text}
      </button>
    );
  }

  return (
    <div
      className="litera-pdf-page-note-editor"
      style={pageNoteStyle(rect, fontSize)}
      onClick={(event) => {
        stopPdfEvent(event);
        onSelect();
      }}
      onMouseDown={stopPdfEvent}
    >
      <div
        className="litera-pdf-page-note-toolbar"
        onPointerDown={(event) => onStartAdjust(note, "move", event)}
      >
        <span className="inline-flex items-center gap-1">
          <MessageSquare className="h-3 w-3" /> {t("reader.linkedNote")}
        </span>
        <span className="litera-pdf-note-font-controls" onPointerDown={(event) => event.stopPropagation()}>
          <button type="button" className="litera-pdf-note-font-button" title={t("reader.noteFontSmaller")} onClick={() => updateFontSize(-2)}>
            <Type className="h-3 w-3" />-
          </button>
          <button type="button" className="litera-pdf-note-font-button" title={t("reader.noteFontLarger")} onClick={() => updateFontSize(2)}>
            <Type className="h-3 w-3" />+
          </button>
        </span>
        <button
          type="button"
          className="text-red-700 hover:text-red-500 transition-colors"
          title={t("common.delete")}
          disabled={deleting}
          onClick={(event) => {
            stopPdfEvent(event);
            setDeleting(true);
            void onDelete(note.id).finally(() => setDeleting(false));
          }}
        >
          {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
        </button>
      </div>
      <textarea
        ref={textareaRef}
        value={state.draft}
        onChange={(event) => setState((current) => ({ ...current, draft: event.target.value }))}
        placeholder={t("reader.linkedNotePlaceholder")}
        className="litera-pdf-page-note-textarea"
      />
      <div className={saveError ? "litera-pdf-page-note-status text-red-400" : "litera-pdf-page-note-status"}>
        {saving && <Loader2 className="h-3 w-3 animate-spin" />}
        {status}
      </div>
      <button
        type="button"
        className="litera-pdf-note-resize"
        title={t("reader.noteResizeTitle")}
        onPointerDown={(event) => onStartAdjust(note, "resize", event)}
      />
    </div>
  );
}

function pageNoteTextStyle(rect: OverlayRect, fontSize = 12): CSSProperties {
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    minHeight: rect.height,
    fontSize: pdfNoteFontSizePx(rect.scale, fontSize),
  };
}

function pageNoteStyle(rect: OverlayRect, fontSize = 12): CSSProperties {
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    fontSize: pdfNoteFontSizePx(rect.scale, fontSize),
  };
}

function noteRectFromDrag(draft: ViewportDraftRect) {
  const x1 = Math.min(draft.x, draft.x2);
  const y1 = Math.min(draft.y, draft.y2);
  const x2 = Math.max(draft.x, draft.x2);
  const y2 = Math.max(draft.y, draft.y2);
  if (x2 - x1 >= MIN_NOTE_SIZE && y2 - y1 >= MIN_NOTE_SIZE) {
    return { x1, y1, x2, y2 };
  }
  return {
    x1,
    y1,
    x2: Math.min(draft.pageWidth, x1 + DEFAULT_NOTE_WIDTH),
    y2: Math.min(draft.pageHeight, y1 + DEFAULT_NOTE_HEIGHT),
  };
}

function pagePoint(event: PointerEvent, page: HTMLElement): NoteDragStart | null {
  const pageRect = page.getBoundingClientRect();
  const pageNumber = Number(page.dataset.pageNumber);
  if (!Number.isFinite(pageNumber) || pageRect.width <= 0 || pageRect.height <= 0) return null;
  const pageWidth = page.clientWidth || pageRect.width;
  const pageHeight = page.clientHeight || pageRect.height;
  return {
    pageNumber,
    pageWidth,
    pageHeight,
    x: clamp(((event.clientX - pageRect.left) / pageRect.width) * pageWidth, 0, pageWidth),
    y: clamp(((event.clientY - pageRect.top) / pageRect.height) * pageHeight, 0, pageHeight),
  };
}

function draftRectToOverlayRect(container: HTMLElement | null, draft: ViewportDraftRect): OverlayRect | null {
  return positionRect(
    container,
    {
      x1: Math.min(draft.x, draft.x2),
      y1: Math.min(draft.y, draft.y2),
      x2: Math.max(draft.x, draft.x2),
      y2: Math.max(draft.y, draft.y2),
      width: draft.pageWidth,
      height: draft.pageHeight,
      pageNumber: draft.pageNumber,
    },
    draft.pageNumber,
  );
}

type ScaledRectLike = {
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  left?: number;
  top?: number;
  width: number;
  height: number;
  pageNumber?: number;
};

function rectToPageRect(rect: ScaledRectLike): PageRect {
  const x1 = rect.x1 ?? rect.left ?? 0;
  const y1 = rect.y1 ?? rect.top ?? 0;
  return {
    x1,
    y1,
    x2: rect.x2 ?? x1 + rect.width,
    y2: rect.y2 ?? y1 + rect.height,
  };
}

function positionRect(container: HTMLElement | null, rect: ScaledRectLike, fallbackPageNumber: number): OverlayRect | null {
  if (!container || rect.width <= 0 || rect.height <= 0) return null;
  const page = pageForPosition(container, rect.pageNumber ?? fallbackPageNumber);
  if (!page) return null;
  const pageRect = page.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const raw = rectToPageRect(rect);
  const scaleX = pageRect.width / rect.width;
  const scaleY = pageRect.height / rect.height;
  return {
    left: pageRect.left - containerRect.left + raw.x1 * scaleX,
    top: pageRect.top - containerRect.top + raw.y1 * scaleY,
    width: Math.max(2, (raw.x2 - raw.x1) * scaleX),
    height: Math.max(2, (raw.y2 - raw.y1) * scaleY),
    scale: (pageRect.width / rect.width + pageRect.height / rect.height) / 2,
  };
}

function pageForPosition(container: HTMLElement, pageNumber: number): HTMLElement | null {
  return container.querySelector<HTMLElement>(`.page[data-page-number="${pageNumber}"]`);
}

function moveRect(rect: PageRect, dx: number, dy: number, pageWidth: number, pageHeight: number): PageRect {
  const width = Math.max(MIN_NOTE_SIZE, rect.x2 - rect.x1);
  const height = Math.max(MIN_NOTE_SIZE, rect.y2 - rect.y1);
  const x1 = clamp(rect.x1 + dx, 0, Math.max(0, pageWidth - width));
  const y1 = clamp(rect.y1 + dy, 0, Math.max(0, pageHeight - height));
  return { x1, y1, x2: x1 + width, y2: y1 + height };
}

function resizeRect(rect: PageRect, x2: number, y2: number, pageWidth: number, pageHeight: number): PageRect {
  return {
    x1: rect.x1,
    y1: rect.y1,
    x2: clamp(Math.max(rect.x1 + MIN_NOTE_SIZE, x2), 0, pageWidth),
    y2: clamp(Math.max(rect.y1 + MIN_NOTE_SIZE, y2), 0, pageHeight),
  };
}

function omitKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([entryKey]) => entryKey !== key)) as Record<string, T>;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
