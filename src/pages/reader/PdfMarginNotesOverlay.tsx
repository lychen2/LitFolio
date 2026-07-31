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
import { Loader2, MessageSquare, RotateCcw, Trash2, Type } from "lucide-react";
import type { ScaledPosition } from "react-pdf-highlighter";

import type { PdfAnnotationRect, PdfTextNote } from "@/core/contracts";
import { useT } from "@/i18n/I18nProvider";
import { PdfLinkedNoteBox } from "./PdfLinkedNoteBox";
import {
  createPdfTextNoteRect,
  nextPdfNoteFontSize,
  pdfNoteFontSizePx,
  pdfTextNoteViewportRect,
  visiblePdfNoteText,
  type PdfPageSize,
} from "./pdfSelectionHelpers";

const MIN_NOTE_SIZE = 20;

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
  position: ScaledPosition;
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

type NoteStatus = {
  state: "saved" | "pending" | "error";
  error: string | null;
};

type PdfMarginNotesOverlayProps = {
  activeNoteId: string | null;
  containerRef: RefObject<HTMLElement>;
  draftRect: ViewportDraftRect | null;
  hiddenLinkedNoteIds: Set<string>;
  linkedNotes: OverlayHighlight[];
  noteDrawMode: boolean;
  pageSizes: Record<number, PdfPageSize>;
  statusById: Record<string, NoteStatus>;
  textNotes: PdfTextNote[];
  onCancelDraft: () => void;
  onCreate: (rect: PdfAnnotationRect) => Promise<void>;
  onDelete: (noteId: string) => Promise<void>;
  onDragStart: (start: NoteDragStart) => void;
  onDraftRect: (rect: ViewportDraftRect) => void;
  onHideLinkedNote: (id: string) => void;
  onSaveLinkedNote: (highlightId: string, draft: string) => Promise<void>;
  onSaveTextNote: (noteId: string, content: string) => Promise<void>;
  onSelect: (id: string | null) => void;
  onStyleTextNote: (
    noteId: string,
    patch: Partial<Pick<PdfTextNote, "color" | "fontSize" | "opacity">>,
  ) => Promise<void>;
  onToggleDrawMode: (enabled: boolean) => void;
  onUpdateRect: (noteId: string, rect: PdfAnnotationRect) => Promise<void>;
};

type NoteAdjustMode = "move" | "resize";

type PositionedLinkedNote = {
  note: OverlayHighlight;
  rect: OverlayRect;
};

type PositionedTextNote = {
  note: PdfTextNote;
  rect: OverlayRect;
};

export function PdfMarginNotesOverlay({
  activeNoteId,
  containerRef,
  draftRect,
  hiddenLinkedNoteIds,
  linkedNotes,
  noteDrawMode,
  pageSizes,
  statusById,
  textNotes,
  onCancelDraft,
  onCreate,
  onDelete,
  onDragStart,
  onDraftRect,
  onHideLinkedNote,
  onSaveLinkedNote,
  onSaveTextNote,
  onSelect,
  onStyleTextNote,
  onToggleDrawMode,
  onUpdateRect,
}: PdfMarginNotesOverlayProps) {
  const t = useT();
  const [layoutVersion, setLayoutVersion] = useState(0);
  const [pendingRects, setPendingRects] = useState<Record<string, PdfAnnotationRect>>({});

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const bump = () => setLayoutVersion((version) => version + 1);
    const observer = new ResizeObserver(bump);
    container.addEventListener("scroll", bump, true);
    window.addEventListener("resize", bump);
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
      const pageNumber = Number(page.dataset.pageNumber);
      const pageSize = pageSizes[pageNumber];
      if (!pageSize) return;
      const start = pagePoint(event, page, pageNumber, pageSize);
      if (!start) return;
      event.preventDefault();
      event.stopPropagation();

      let current: ViewportDraftRect = { ...start, x2: start.x, y2: start.y };
      onDragStart(start);
      onDraftRect(current);

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const point = pagePoint(moveEvent, page, pageNumber, pageSize);
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
        const rect = createPdfTextNoteRect({
          page: start.pageNumber,
          pageSize,
          start,
          end: { x: current.x2, y: current.y2 },
        });
        void onCreate(rect).catch(() => undefined);
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
  }, [containerRef, noteDrawMode, onCancelDraft, onCreate, onDragStart, onDraftRect, pageSizes]);

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
        const rect = scaledPositionRect(containerRef.current, note.position.boundingRect, note.position.pageNumber);
        return rect ? { note, rect } : null;
      })
      .filter((item): item is PositionedLinkedNote => item !== null);
  }, [activeNoteId, containerRef, hiddenLinkedNoteIds, layoutVersion, linkedNotes]);

  const textNoteBoxes = useMemo(() => {
    void layoutVersion;
    return textNotes
      .map((note) => ({ ...note, rect: pendingRects[note.id] ?? note.rect }))
      .map((note) => {
        const pageSize = pageSizes[note.rect.page];
        const rect = pageSize
          ? textNoteRect(containerRef.current, note.rect, pageSize)
          : null;
        return rect ? { note, rect } : null;
      })
      .filter((item): item is PositionedTextNote => item !== null);
  }, [containerRef, layoutVersion, pageSizes, pendingRects, textNotes]);

  const draftOverlayRect = draftRect
    ? draftRectToOverlayRect(containerRef.current, draftRect)
    : null;

  function startNoteAdjustment(note: PdfTextNote, mode: NoteAdjustMode, event: ReactPointerEvent) {
    if (event.button !== 0) return;
    const container = containerRef.current;
    const pageSize = pageSizes[note.rect.page];
    if (!container || !pageSize) return;
    const page = pageForPosition(container, note.rect.page);
    if (!page) return;
    const start = pagePoint(event.nativeEvent, page, note.rect.page, pageSize);
    if (!start) return;
    const original = pendingRects[note.id] ?? note.rect;
    let nextRect: PdfAnnotationRect | null = null;
    event.preventDefault();
    event.stopPropagation();

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const point = pagePoint(moveEvent, page, note.rect.page, pageSize);
      if (!point) return;
      nextRect = mode === "move"
        ? moveRect(original, point.x - start.x, point.y - start.y, pageSize)
        : resizeRect(original, point.x, point.y, pageSize);
      setPendingRects((current) => ({ ...current, [note.id]: nextRect as PdfAnnotationRect }));
    };

    const handlePointerCancel = () => {
      cleanup();
      setPendingRects((current) => omitKey(current, note.id));
    };

    const handlePointerUp = () => {
      cleanup();
      if (!nextRect) return;
      void onUpdateRect(note.id, nextRect)
        .then(() => setPendingRects((current) => omitKey(current, note.id)))
        .catch(() => setPendingRects((current) => omitKey(current, note.id)));
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
          onSave={onSaveLinkedNote}
          onClose={() => onHideLinkedNote(note.id)}
        />
      ))}
      {textNoteBoxes.map(({ note, rect }) => (
        <PdfPageNoteBox
          key={`${note.id}:text-note`}
          note={note}
          active={activeNoteId === note.id}
          rect={rect}
          status={statusById[note.id] ?? { state: "saved", error: null }}
          onDelete={onDelete}
          onSave={onSaveTextNote}
          onSelect={() => onSelect(note.id)}
          onStyle={onStyleTextNote}
          onStartAdjust={startNoteAdjustment}
        />
      ))}
    </div>
  );
}

type PdfPageNoteBoxProps = {
  note: PdfTextNote;
  active: boolean;
  rect: OverlayRect;
  status: NoteStatus;
  onDelete: (noteId: string) => Promise<void>;
  onSave: (noteId: string, content: string) => Promise<void>;
  onSelect: () => void;
  onStyle: (
    noteId: string,
    patch: Partial<Pick<PdfTextNote, "color" | "fontSize" | "opacity">>,
  ) => Promise<void>;
  onStartAdjust: (note: PdfTextNote, mode: NoteAdjustMode, event: ReactPointerEvent) => void;
};

function PdfPageNoteBox({
  note,
  active,
  rect,
  status,
  onDelete,
  onSave,
  onSelect,
  onStyle,
  onStartAdjust,
}: PdfPageNoteBoxProps) {
  const t = useT();
  const [deleting, setDeleting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!active) return;
    textareaRef.current?.focus();
  }, [active, note.id]);

  function stopPdfEvent(event: ReactMouseEvent) {
    event.stopPropagation();
  }

  function updateContent(content: string) {
    void onSave(note.id, content).catch(() => undefined);
  }

  function updateStyle(patch: Partial<Pick<PdfTextNote, "color" | "fontSize" | "opacity">>) {
    void onStyle(note.id, patch).catch(() => undefined);
  }

  if (!active) {
    const text = visiblePdfNoteText(note.content);
    if (!text) return null;
    return (
      <button
        type="button"
        className="litera-pdf-note-text"
        style={pageNoteTextStyle(rect, note)}
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

  const statusLabel = status.state === "error"
    ? `${t("reader.saveFailed")}: ${status.error ?? t("reader.unknownError")}`
    : status.state === "pending"
      ? t("reader.saving")
      : t("reader.saved");

  return (
    <div
      className="litera-pdf-page-note-editor"
      style={pageNoteStyle(rect, note)}
      onClick={(event) => {
        stopPdfEvent(event);
        onSelect();
      }}
      onMouseDown={stopPdfEvent}
      onKeyDown={(event) => {
        if (event.key === "Escape") onSelect();
      }}
    >
      <div
        className="litera-pdf-page-note-toolbar"
        style={{ color: note.color }}
        onPointerDown={(event) => onStartAdjust(note, "move", event)}
      >
        <span className="inline-flex items-center gap-1">
          <MessageSquare className="h-3 w-3" /> {t("reader.standaloneNote")}
        </span>
        <span
          className="litera-pdf-note-font-controls"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <label className="inline-flex items-center" title={t("reader.noteColorTitle")}>
            <input
              type="color"
              value={note.color}
              aria-label={t("reader.noteColorTitle")}
              className="h-4 w-4 cursor-pointer border-0 bg-transparent p-0"
              onChange={(event) => updateStyle({ color: event.target.value })}
            />
          </label>
          <button
            type="button"
            className="litera-pdf-note-font-button"
            title={t("reader.noteFontSmaller")}
            onClick={() => updateStyle({ fontSize: nextPdfNoteFontSize(note.fontSize, -2) })}
          >
            <Type className="h-3 w-3" />-
          </button>
          <button
            type="button"
            className="litera-pdf-note-font-button"
            title={t("reader.noteFontLarger")}
            onClick={() => updateStyle({ fontSize: nextPdfNoteFontSize(note.fontSize, 2) })}
          >
            <Type className="h-3 w-3" />+
          </button>
          <label className="inline-flex items-center" title={t("reader.noteOpacityTitle")}>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.1"
              value={note.opacity}
              aria-label={t("reader.noteOpacityTitle")}
              className="w-12"
              onChange={(event) => updateStyle({ opacity: Number(event.target.value) })}
            />
          </label>
          <button
            type="button"
            className="litera-pdf-note-font-button"
            title={t("reader.noteResetStyleTitle")}
            onClick={() => updateStyle({ color: "#fff3a3", fontSize: 12, opacity: 0.9 })}
          >
            <RotateCcw className="h-3 w-3" />
          </button>
        </span>
        <button
          type="button"
          className="text-litera-error transition-colors"
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
        value={note.content}
        onChange={(event) => updateContent(event.target.value)}
        placeholder={t("reader.linkedNotePlaceholder")}
        aria-label={t("reader.standaloneNote")}
        className="litera-pdf-page-note-textarea"
        style={{ color: note.color }}
      />
      <div className={status.state === "error" ? "litera-pdf-page-note-status text-litera-error" : "litera-pdf-page-note-status"}>
        {status.state === "pending" && <Loader2 className="h-3 w-3 animate-spin" />}
        {statusLabel}
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

function pageNoteTextStyle(rect: OverlayRect, note: PdfTextNote): CSSProperties {
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    minHeight: rect.height,
    fontSize: pdfNoteFontSizePx(rect.scale, note.fontSize),
    color: note.color,
    opacity: note.opacity,
  };
}

function pageNoteStyle(rect: OverlayRect, note: PdfTextNote): CSSProperties {
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    fontSize: pdfNoteFontSizePx(rect.scale, note.fontSize),
    borderColor: note.color,
    opacity: note.opacity,
  };
}

function pagePoint(
  event: PointerEvent,
  page: HTMLElement,
  pageNumber: number,
  pageSize: PdfPageSize,
): NoteDragStart | null {
  const pageRect = page.getBoundingClientRect();
  if (pageRect.width <= 0 || pageRect.height <= 0) return null;
  return {
    pageNumber,
    pageWidth: pageSize.width,
    pageHeight: pageSize.height,
    x: clamp(((event.clientX - pageRect.left) / pageRect.width) * pageSize.width, 0, pageSize.width),
    y: clamp(((event.clientY - pageRect.top) / pageRect.height) * pageSize.height, 0, pageSize.height),
  };
}

function draftRectToOverlayRect(
  container: HTMLElement | null,
  draft: ViewportDraftRect,
): OverlayRect | null {
  const pageSize = { width: draft.pageWidth, height: draft.pageHeight };
  const rect = createPdfTextNoteRect({
    page: draft.pageNumber,
    pageSize,
    start: draft,
    end: { x: draft.x2, y: draft.y2 },
  });
  return textNoteRect(container, rect, pageSize);
}

function textNoteRect(
  container: HTMLElement | null,
  rect: PdfAnnotationRect,
  pageSize: PdfPageSize,
): OverlayRect | null {
  if (!container) return null;
  const page = pageForPosition(container, rect.page);
  if (!page) return null;
  const pageRect = page.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const scaled = pdfTextNoteViewportRect(rect, pageSize, {
    width: pageRect.width,
    height: pageRect.height,
  });
  return {
    left: pageRect.left - containerRect.left + scaled.left,
    top: pageRect.top - containerRect.top + scaled.top,
    width: Math.max(2, scaled.width),
    height: Math.max(2, scaled.height),
    scale: scaled.scale,
  };
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

function scaledPositionRect(
  container: HTMLElement | null,
  rect: ScaledRectLike,
  fallbackPageNumber: number,
): OverlayRect | null {
  if (!container || rect.width <= 0 || rect.height <= 0) return null;
  const page = pageForPosition(container, rect.pageNumber ?? fallbackPageNumber);
  if (!page) return null;
  const pageRect = page.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const x1 = rect.x1 ?? rect.left ?? 0;
  const y1 = rect.y1 ?? rect.top ?? 0;
  const x2 = rect.x2 ?? x1 + rect.width;
  const y2 = rect.y2 ?? y1 + rect.height;
  const scaleX = pageRect.width / rect.width;
  const scaleY = pageRect.height / rect.height;
  return {
    left: pageRect.left - containerRect.left + x1 * scaleX,
    top: pageRect.top - containerRect.top + y1 * scaleY,
    width: Math.max(2, (x2 - x1) * scaleX),
    height: Math.max(2, (y2 - y1) * scaleY),
    scale: (scaleX + scaleY) / 2,
  };
}

function pageForPosition(container: HTMLElement, pageNumber: number): HTMLElement | null {
  return container.querySelector<HTMLElement>(`.page[data-page-number="${pageNumber}"]`);
}

function moveRect(
  rect: PdfAnnotationRect,
  dx: number,
  dy: number,
  pageSize: PdfPageSize,
): PdfAnnotationRect {
  const width = Math.max(MIN_NOTE_SIZE, rect.width);
  const height = Math.max(MIN_NOTE_SIZE, rect.height);
  return {
    ...rect,
    x: clamp(rect.x + dx, 0, Math.max(0, pageSize.width - width)),
    y: clamp(rect.y + dy, 0, Math.max(0, pageSize.height - height)),
    width,
    height,
  };
}

function resizeRect(
  rect: PdfAnnotationRect,
  x2: number,
  y2: number,
  pageSize: PdfPageSize,
): PdfAnnotationRect {
  return {
    ...rect,
    width: clamp(Math.max(MIN_NOTE_SIZE, x2 - rect.x), MIN_NOTE_SIZE, pageSize.width - rect.x),
    height: clamp(Math.max(MIN_NOTE_SIZE, y2 - rect.y), MIN_NOTE_SIZE, pageSize.height - rect.y),
  };
}

function omitKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([entryKey]) => entryKey !== key)) as Record<string, T>;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
