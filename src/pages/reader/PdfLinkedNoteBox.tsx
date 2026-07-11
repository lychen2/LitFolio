import { useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import { Loader2, MessageSquare, X } from "lucide-react";
import { useT } from "@/i18n/I18nProvider";
import {
  highlightNoteUpdateValue,
  nextLinkedPdfNoteDraft,
} from "./pdfSelectionHelpers";

type Rect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type NoteState = {
  highlightId: string;
  draft: string;
  saved: string;
};

export function PdfLinkedNoteBox({
  highlightId,
  note,
  rects,
  active,
  onSave,
  onClose,
}: {
  highlightId: string;
  note: string | null;
  rects: Rect[];
  active: boolean;
  onSave: (highlightId: string, draft: string) => Promise<void>;
  onClose: () => void;
}) {
  const t = useT();
  const [state, setState] = useState<NoteState>(() => ({
    highlightId,
    draft: note ?? "",
    saved: note ?? "",
  }));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const saveSeqRef = useRef(0);

  useEffect(() => {
    setState((current) => {
      if (current.highlightId !== highlightId) {
        return { highlightId, draft: note ?? "", saved: note ?? "" };
      }
      const dirty = current.draft !== current.saved;
      return {
        highlightId,
        draft: nextLinkedPdfNoteDraft({
          currentDraft: current.draft,
          incomingNote: note,
          dirty,
        }),
        saved: dirty ? current.saved : note ?? "",
      };
    });
  }, [highlightId, note]);

  useEffect(() => {
    if (!active) return;
    textareaRef.current?.focus();
  }, [active, highlightId]);

  useEffect(() => {
    if (state.draft === state.saved) return;
    const draftToSave = state.draft;
    const timeoutId = window.setTimeout(() => {
      const saveSeq = saveSeqRef.current + 1;
      saveSeqRef.current = saveSeq;
      setSaving(true);
      setSaveError(null);
      onSave(highlightId, draftToSave)
        .then(() => {
          const normalized = highlightNoteUpdateValue(draftToSave) ?? "";
          setState((current) =>
            current.highlightId === highlightId
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
  }, [highlightId, onSave, state.draft, state.saved]);

  const firstRect = rects[0];
  if (!firstRect) return null;

  const status = saveError
    ? `${t("reader.saveFailed")}: ${saveError}`
    : saving
      ? t("reader.saving")
      : state.draft === state.saved
        ? t("reader.saved")
        : t("reader.unsaved");

  function stopPdfClick(event: ReactMouseEvent) {
    event.stopPropagation();
  }

  return (
    <div
      className="litera-pdf-note-box"
      style={noteBoxStyle(firstRect)}
      onClick={stopPdfClick}
      onMouseDown={stopPdfClick}
    >
      <div className="litera-pdf-note-title">
        <span className="inline-flex items-center gap-1">
          <MessageSquare className="h-3 w-3" /> {t("reader.linkedNote")}
        </span>
        <button
          type="button"
          className="text-litera-mute hover:text-litera-text transition-colors"
          title={t("common.close")}
          onClick={onClose}
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      <textarea
        ref={textareaRef}
        value={state.draft}
        onChange={(event) => setState((current) => ({ ...current, draft: event.target.value }))}
        placeholder={t("reader.linkedNotePlaceholder")}
        className="litera-pdf-note-textarea"
      />
      <div className={saveError ? "litera-pdf-note-status text-red-300" : "litera-pdf-note-status"}>
        {saving && <Loader2 className="h-3 w-3 animate-spin" />}
        {status}
      </div>
    </div>
  );
}

function noteBoxStyle(rect: Rect): CSSProperties {
  const width = 224;
  const gap = 10;
  const left = rect.left > width + gap * 2 ? rect.left - width - gap : rect.left + rect.width + gap;
  return {
    top: Math.max(0, rect.top - 4),
    left: Math.max(8, left),
    width,
  };
}
