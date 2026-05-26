import { useEffect, useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { Languages, Loader2, MessageSquare, Trash2 } from "lucide-react";
import { api, type Highlight } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";
import { MIN_SUMMARY_CHARS, WESTERN_TEXT_STYLE } from "../HighlightList";

export function HighlightRow({
  highlight,
  onJump,
  onRefresh,
}: {
  highlight: Highlight;
  onJump: () => void;
  onRefresh: () => Promise<unknown>;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [showOriginal, setShowOriginal] = useState(!hasCondensedContent(highlight));
  const [draftNote, setDraftNote] = useState(highlight.note ?? "");
  const [confirming, setConfirming] = useState(false);
  const saveNote = useMutation({
    mutationFn: (note: string) => api.highlightUpdateNote(highlight.id, note || null),
    onSuccess: async () => {
      setEditing(false);
      await onRefresh();
    },
  });
  const translate = useMutation({
    mutationFn: () => api.highlightTranslate(highlight.id),
    onSuccess: async () => {
      setShowOriginal(false);
      await onRefresh();
    },
  });
  const summarize = useMutation({
    mutationFn: () => api.highlightSummarize(highlight.id),
    onSuccess: async () => {
      setShowOriginal(false);
      await onRefresh();
    },
  });
  const remove = useMutation({
    mutationFn: () => api.highlightDelete(highlight.id),
    onSuccess: onRefresh,
  });
  const canSummarize = countChars(highlight.text) >= MIN_SUMMARY_CHARS;

  useEffect(() => {
    setDraftNote(highlight.note ?? "");
  }, [highlight.note]);

  useEffect(() => {
    if (hasCondensedContent(highlight)) {
      setShowOriginal(false);
    }
  }, [highlight.summary_text, highlight.translation_text]);

  return (
    <li className="group px-3 py-2.5 hover:bg-litera-panel/40 transition-colors">
      <button onClick={onJump} className="w-full text-left">
        <div className="text-[10px] uppercase tracking-wider text-amber-400/70 mb-1">
          {t("reader.page", { page: highlight.page })}
        </div>
        {highlight.summary_text && (
          <MetaTextBlock
            label={t("reader.summarizeLabel")}
            model={highlight.summary_model}
            text={highlight.summary_text}
          />
        )}
        {highlight.translation_text && (
          <MetaTextBlock
            label={highlight.translation_target_lang ?? t("reader.translateLabel")}
            model={highlight.translation_model}
            text={highlight.translation_text}
            icon={<Languages className="h-3 w-3" />}
          />
        )}
        {(!hasCondensedContent(highlight) || showOriginal) && (
          <OriginalBlock text={highlight.text} />
        )}
      </button>
      {confirming ? (
        <div className="mt-2 flex items-center gap-1.5 text-[10px]">
          <span className="text-red-400/90">{t("reader.confirmDelete")}</span>
          <button
            onClick={() => { remove.mutate(); setConfirming(false); }}
            className="litera-btn-primary text-[10px] px-2 py-0.5"
          >
            {t("reader.confirm")}
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="litera-btn text-[10px] px-2 py-0.5"
          >
            {t("common.cancel")}
          </button>
        </div>
      ) : (
        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
        <ActionRow
          canSummarize={canSummarize}
          editing={editing}
          hasSummary={!!highlight.summary_text}
          hasTranslation={!!highlight.translation_text}
          isDeleting={remove.isPending}
          isSummarizing={summarize.isPending}
          isTranslating={translate.isPending}
          showOriginal={showOriginal}
          onDelete={() => setConfirming(true)}
          onEditNote={() => {
            setEditing(true);
            setDraftNote(highlight.note ?? "");
          }}
          onSummarize={() => summarize.mutate()}
          onToggleOriginal={() => setShowOriginal((value) => !value)}
          onTranslate={() => translate.mutate()}
        />
        </div>
      )}
      {highlight.note && !editing && <NoteBlock note={highlight.note} />}
      {editing && (
        <NoteEditor
          draftNote={draftNote}
          isSaving={saveNote.isPending}
          onCancel={() => {
            setEditing(false);
            setDraftNote(highlight.note ?? "");
          }}
          onChange={setDraftNote}
          onSave={() => saveNote.mutate(draftNote)}
        />
      )}
      {summarize.error && (
        <ErrorText message={(summarize.error as Error).message} />
      )}
      {translate.error && (
        <ErrorText message={(translate.error as Error).message} />
      )}
    </li>
  );
}

function ActionRow({
  canSummarize,
  editing,
  hasSummary,
  hasTranslation,
  isDeleting,
  isSummarizing,
  isTranslating,
  showOriginal,
  onDelete,
  onEditNote,
  onSummarize,
  onToggleOriginal,
  onTranslate,
}: {
  canSummarize: boolean;
  editing: boolean;
  hasSummary: boolean;
  hasTranslation: boolean;
  isDeleting: boolean;
  isSummarizing: boolean;
  isTranslating: boolean;
  showOriginal: boolean;
  onDelete: () => void;
  onEditNote: () => void;
  onSummarize: () => void;
  onToggleOriginal: () => void;
  onTranslate: () => void;
}) {
  const t = useT();
  if (editing) {
    return null;
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-litera-mute">
      {canSummarize && (
        <ActionButton disabled={isSummarizing} onClick={onSummarize}>
          {isSummarizing ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          {hasSummary ? t("reader.redoSummary") : t("reader.summarize")}
        </ActionButton>
      )}
      <ActionButton disabled={isTranslating} onClick={onTranslate}>
        {isTranslating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Languages className="h-3 w-3" />}
        {hasTranslation ? t("reader.retranslate") : t("common.translate")}
      </ActionButton>
      {hasCondensedAction(hasSummary, hasTranslation) && (
        <ActionButton onClick={onToggleOriginal}>
          {showOriginal ? t("reader.collapseOriginal") : t("reader.expandOriginal")}
        </ActionButton>
      )}
      <ActionButton onClick={onEditNote}>
        <MessageSquare className="h-3 w-3" /> {t("reader.comment")}
      </ActionButton>
      <ActionButton disabled={isDeleting} onClick={onDelete}>
        {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
        {t("common.delete")}
      </ActionButton>
    </div>
  );
}

function MetaTextBlock({
  icon,
  label,
  model,
  text,
}: {
  icon?: ReactNode;
  label: string;
  model: string | null;
  text: string;
}) {
  return (
    <div className="mt-1.5 text-[11px] text-litera-accent2/90">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-litera-mute mb-1">
        {icon}
        {label}
        {model ? <span className="normal-case tracking-normal text-litera-mute/80">{model}</span> : null}
      </div>
      <p className="leading-5 whitespace-pre-wrap">{text}</p>
    </div>
  );
}

function OriginalBlock({ text }: { text: string }) {
  return (
    <p
      lang="en"
      className="text-[11px] leading-5 text-litera-text whitespace-pre-wrap"
      style={WESTERN_TEXT_STYLE}
    >
      {normalizePreview(text)}
    </p>
  );
}

function NoteBlock({ note }: { note: string }) {
  const t = useT();
  return (
    <div className="mt-2 text-[11px] text-litera-accent2/90">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-litera-mute mb-1">
        <MessageSquare className="h-3 w-3" /> {t("reader.comment")}
      </div>
      <p className="leading-5 whitespace-pre-wrap">{note}</p>
    </div>
  );
}

function NoteEditor({
  draftNote,
  isSaving,
  onCancel,
  onChange,
  onSave,
}: {
  draftNote: string;
  isSaving: boolean;
  onCancel: () => void;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  const t = useT();
  return (
    <div className="mt-2 space-y-1.5">
      <textarea
        autoFocus
        value={draftNote}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t("reader.commentPlaceholder")}
        className="litera-input w-full text-xs h-16 resize-none"
      />
      <div className="flex gap-1.5">
        <button onClick={onSave} disabled={isSaving} className="litera-btn-primary text-[11px] px-2 py-0.5">
          {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          {t("common.save")}
        </button>
        <button onClick={onCancel} className="litera-btn text-[11px] px-2 py-0.5">
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}

function ActionButton({
  children,
  disabled,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center gap-1 transition-colors disabled:opacity-60 hover:text-litera-text"
    >
      {children}
    </button>
  );
}

function ErrorText({ message }: { message: string }) {
  return (
    <div className="mt-2 text-[11px] text-red-400/90 break-all">
      ✕ {message}
    </div>
  );
}

function hasCondensedAction(hasSummary: boolean, hasTranslation: boolean) {
  return hasSummary || hasTranslation;
}

function hasCondensedContent(highlight: Highlight) {
  return !!highlight.summary_text || !!highlight.translation_text;
}

function countChars(text: string) {
  return Array.from(text.trim()).length;
}

function normalizePreview(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized || "(empty)";
}
