import { Copy, Highlighter, Loader2, Minus, Moon, Plus, RotateCcw, Sun } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useT } from "@/i18n/I18nProvider";

type PdfToolbarProps = {
  dark: boolean;
  zoomLabel: string;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onZoomIn: () => void;
  onZoomFit: () => void;
  onToggleDark: () => void;
};

type SelectionActionsProps = {
  onHighlight: () => void;
  onCopy: () => void;
  onTranslate: () => void;
  onAddTerm: () => void;
  pending: boolean;
};

export function PdfToolbar({
  dark,
  zoomLabel,
  onZoomOut,
  onZoomReset,
  onZoomIn,
  onZoomFit,
  onToggleDark,
}: PdfToolbarProps) {
  const t = useT();
  return (
    <>
      <div className="absolute top-2 left-2 z-20 litera-overlay flex items-center gap-1 px-1.5 py-1">
        <IconButton onClick={onZoomOut} title={t("reader.zoomOutTitle")}>
          <Minus className="h-3.5 w-3.5" />
        </IconButton>
        <button
          onClick={onZoomReset}
          className="litera-btn text-[11px] px-2 py-0.5 min-w-12 justify-center"
          title={t("reader.zoomResetTitle")}
        >
          {zoomLabel}
        </button>
        <IconButton onClick={onZoomIn} title={t("reader.zoomInTitle")}>
          <Plus className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton onClick={onZoomFit} title={t("reader.zoomFitTitle")}>
          <RotateCcw className="h-3.5 w-3.5" />
        </IconButton>
      </div>
      <button
        onClick={onToggleDark}
        className="absolute top-2 right-2 z-20 litera-btn text-xs"
        title={dark ? t("reader.lightModeTitle") : t("reader.darkModeTitle")}
      >
        {dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        {dark ? t("reader.lightMode") : t("reader.darkMode")}
      </button>
    </>
  );
}

export function SelectionActions({
  onHighlight,
  onCopy,
  onTranslate,
  onAddTerm,
  pending,
}: SelectionActionsProps) {
  const t = useT();
  return (
    <div className="litera-overlay p-1.5 flex items-center gap-1.5 litera-slide-up">
      <button onClick={onHighlight} className="litera-btn-primary text-xs px-2 py-1">
        {t("reader.addHighlight")}
      </button>
      <button onClick={onCopy} className="litera-btn text-xs px-2 py-1">
        <Copy className="h-3 w-3" />
        {t("reader.copySelection")}
      </button>
      <button onClick={onTranslate} className="litera-btn text-xs px-2 py-1">
        {t("reader.translateSelection")}
      </button>
      <button onClick={onAddTerm} disabled={pending} className="litera-btn text-xs px-2 py-1">
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
        {t("reader.addTerm")}
      </button>
    </div>
  );
}

export function Center({ children }: { children: ReactNode }) {
  return (
    <div className="h-full grid place-items-center text-sm text-litera-mute">
      <div>{children}</div>
    </div>
  );
}

type VisiblePdfError = {
  stage?: string;
  name?: string;
  message?: string;
  detail?: string;
  assetPath?: string;
  assetUrl?: string;
};

export function PdfLoadError({ error, onRetry }: { error?: VisiblePdfError; onRetry?: () => void }) {
  const t = useT();
  const fields = pdfErrorFields(error, t("reader.unknownError"));
  const [copied, setCopied] = useState(false);
  async function copyDetails() {
    await navigator.clipboard.writeText(formatPdfError(fields));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }
  return (
    <div className="h-full grid place-items-center text-sm text-red-400/90 p-6 text-center">
      <div className="max-w-2xl w-full">
        <div className="font-medium mb-1">✕ {t("reader.pdfRenderFailed")}</div>
        <div className="text-xs text-litera-mute mb-3">{t("reader.pdfErrorHint")}</div>
        <div className="text-left rounded border border-red-400/30 bg-litera-paper px-3 py-2 space-y-1">
          {fields.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2 text-xs">
              <span className="text-litera-mute">{label}</span>
              <span className="font-mono text-red-200/90 break-all whitespace-pre-wrap">{value}</span>
            </div>
          ))}
        </div>
        {onRetry && (
          <button onClick={onRetry} className="litera-btn text-xs px-3 py-1 mt-3">
            {t("common.retry")}
          </button>
        )}
        <button onClick={copyDetails} className="litera-btn text-xs px-3 py-1 mt-3 ml-2">
          <Copy className="h-3 w-3" />
          {copied ? t("reader.errorDetailsCopied") : t("reader.copyErrorDetails")}
        </button>
      </div>
    </div>
  );
}

function pdfErrorFields(error: VisiblePdfError | undefined, fallback: string): Array<[string, string]> {
  if (!error) return [["message", fallback]];
  return [
    ["stage", error.stage],
    ["name", error.name],
    ["message", error.message || fallback],
    ["assetPath", error.assetPath],
    ["assetUrl", error.assetUrl],
    ["detail", error.detail],
  ].filter((field): field is [string, string] => typeof field[1] === "string" && field[1].trim().length > 0);
}

function formatPdfError(fields: Array<[string, string]>): string {
  return fields.map(([label, value]) => `${label}: ${value}`).join("\n");
}

export function PdfMutationError({
  createError,
  termError,
  onRetry,
}: {
  createError: unknown;
  termError: unknown;
  onRetry: () => void;
}) {
  const t = useT();
  const message = errorMessage(createError) || errorMessage(termError);
  if (!message) return null;
  return (
    <div className="absolute top-2 right-2 text-xs text-red-400/90 bg-litera-paper border border-red-400/30 rounded px-2 py-1 max-w-[24rem] flex items-center gap-2">
      <span>✕ {message}</span>
      <button onClick={onRetry} className="text-litera-mute hover:text-litera-text transition-colors">
        {t("common.retry")}
      </button>
    </div>
  );
}

export function PdfStatusBadge({ highlights, terms }: { highlights: number; terms: number }) {
  const t = useT();
  return (
    <div className="absolute bottom-2 left-2 text-[11px] text-litera-mute bg-litera-paper/80 border border-litera-line rounded px-2 py-0.5 inline-flex items-center gap-2 pointer-events-none">
      <span className="inline-flex items-center gap-1">
        <Highlighter className="h-3 w-3 text-amber-400" />
        {highlights} {t("reader.highlights")}
      </span>
      <span>·</span>
      <span>{terms} {t("reader.terms")}</span>
    </div>
  );
}

function IconButton({ onClick, title, children }: {
  onClick: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <button onClick={onClick} className="litera-btn text-xs px-1.5 py-0.5" title={title}>
      {children}
    </button>
  );
}

function errorMessage(error: unknown): string {
  if (!error) return "";
  return error instanceof Error ? error.message : String(error);
}
