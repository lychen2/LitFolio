import { useState, type ReactNode } from "react";
import { Languages, Lightbulb, Loader2, MessageSquare } from "lucide-react";
import { MarkdownView } from "@/components/MarkdownView";
import { useT } from "@/i18n/I18nProvider";
import { WESTERN_TEXT_STYLE } from "../HighlightList";
import { normalizePreview } from "./highlightRowUtils";

export function MetaTextBlock({
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
        {model ? (
          <span className="normal-case tracking-normal text-litera-mute/80">
            {model}
          </span>
        ) : null}
      </div>
      <MarkdownView
        content={text}
        className="markdown-body text-[11px] leading-5 text-litera-accent2/90 [&_p]:my-0.5 [&_p]:text-[11px] [&_p]:leading-5 [&_li]:text-[11px] [&_li]:leading-5 [&_.katex]:text-[1em]"
      />
    </div>
  );
}

export function TranslationIcon() {
  return <Languages className="h-3 w-3" />;
}

export function ExplanationBlock({
  model,
  text,
}: {
  model: string | null;
  text: string;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-2 rounded-md border border-litera-line/80 bg-litera-panel/35 px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        <Lightbulb className="h-3 w-3 shrink-0 text-amber-300/90" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1 text-[10px] uppercase tracking-wider text-litera-mute">
            <span className="text-amber-300/90">
              {t("reader.explainLabel")}
            </span>
            {model ? (
              <span className="normal-case tracking-normal text-litera-mute/70">
                {model}
              </span>
            ) : null}
          </div>
          {expanded ? (
            <p className="mt-0.5 text-[10px] leading-4 text-litera-mute">
              {t("reader.explainHint")}
            </p>
          ) : null}
        </div>
        <button
          onClick={(event) => {
            event.stopPropagation();
            setExpanded((v) => !v);
          }}
          className="shrink-0 text-[10px] text-litera-accent transition-colors hover:text-litera-accent2"
        >
          {expanded
            ? t("reader.collapseExplanation")
            : t("reader.expandExplanation")}
        </button>
      </div>
      {expanded ? (
        <MarkdownView
          content={text}
          className="markdown-body mt-2 text-[11px] leading-5 text-litera-text [&_li]:text-[11px] [&_li]:leading-5 [&_p]:my-1 [&_p]:text-[11px] [&_p]:leading-5"
        />
      ) : null}
    </div>
  );
}

export function OriginalBlock({ text }: { text: string }) {
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

export function NoteBlock({ note }: { note: string }) {
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

export function NoteEditor({
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
        <button
          onClick={onSave}
          disabled={isSaving}
          className="litera-btn-primary text-[11px] px-2 py-0.5"
        >
          {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          {t("common.save")}
        </button>
        <button
          onClick={onCancel}
          className="litera-btn text-[11px] px-2 py-0.5"
        >
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}

export function ErrorText({ message }: { message: string }) {
  return (
    <div className="mt-2 text-[11px] text-red-400/90 break-all">
      ✕ {message || "Unknown error"}
    </div>
  );
}
