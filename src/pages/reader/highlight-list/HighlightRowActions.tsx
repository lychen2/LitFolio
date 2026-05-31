import { Languages, Lightbulb, Loader2, MessageSquare, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useT } from "@/i18n/I18nProvider";

type ActionRowProps = {
  canSummarize: boolean;
  editing: boolean;
  hasCondensed: boolean;
  hasExplanation: boolean;
  hasSummary: boolean;
  hasTranslation: boolean;
  isDeleting: boolean;
  isExplaining: boolean;
  isSummarizing: boolean;
  isTranslating: boolean;
  showOriginal: boolean;
  onDelete: () => void;
  onEditNote: () => void;
  onExplain: () => void;
  onSummarize: () => void;
  onToggleOriginal: () => void;
  onTranslate: () => void;
};

export function ActionRow({
  canSummarize,
  editing,
  hasCondensed,
  hasExplanation,
  hasSummary,
  hasTranslation,
  isDeleting,
  isExplaining,
  isSummarizing,
  isTranslating,
  showOriginal,
  onDelete,
  onEditNote,
  onExplain,
  onSummarize,
  onToggleOriginal,
  onTranslate,
}: ActionRowProps) {
  const t = useT();
  if (editing) {
    return null;
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-litera-mute">
      <ActionButton disabled={isExplaining} onClick={onExplain}>
        {isExplaining ? <Loader2 className="h-3 w-3 animate-spin" /> : <Lightbulb className="h-3 w-3" />}
        {hasExplanation ? t("reader.reExplain") : t("reader.explain")}
      </ActionButton>
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
      {hasCondensed && (
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
