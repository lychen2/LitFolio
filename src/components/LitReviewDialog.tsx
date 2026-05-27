import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ClipboardCopy, Download, FileText, Loader2, PenLine, X } from "lucide-react";
import { api, type LitReviewResult } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";

const GROUPINGS = [
  { value: "theme", labelKey: "litReview.groupTheme" },
  { value: "method", labelKey: "litReview.groupMethod" },
  { value: "year", labelKey: "litReview.groupYear" },
  { value: "application_domain", labelKey: "litReview.groupDomain" },
] as const;

export function LitReviewDialog({
  paperIds,
  paperCount,
  onClose,
  onSaveNote,
}: {
  paperIds: string[];
  paperCount: number;
  onClose: () => void;
  onSaveNote?: (markdown: string) => void;
}) {
  const t = useT();
  const [grouping, setGrouping] = useState<string>("theme");
  const [result, setResult] = useState<LitReviewResult | null>(null);
  const [editedMarkdown, setEditedMarkdown] = useState<string>("");
  const [copied, setCopied] = useState(false);

  const genMut = useMutation({
    mutationFn: () => api.generateLitReview(paperIds, grouping),
    onSuccess: (data) => {
      setResult(data);
      setEditedMarkdown(data.markdown);
    },
  });

  const handleCopy = async () => {
    await navigator.clipboard.writeText(editedMarkdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const date = new Date().toISOString().slice(0, 10);
    const blob = new Blob([editedMarkdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `literature-review-${date}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-litera-ink/40 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[720px] max-w-[90vw] h-[80vh] bg-litera-paper border border-litera-line rounded-xl shadow-2xl flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-litera-line shrink-0">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-litera-accent" />
            <span className="font-medium">{t("litReview.title")}</span>
            <span className="text-xs text-litera-mute">({paperCount} {t("litReview.papers")})</span>
          </div>
          <button onClick={onClose} className="text-litera-mute hover:text-litera-text">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Grouping selector (always visible) */}
        <div className="px-5 py-3 border-b border-litera-line shrink-0">
          <label className="text-xs text-litera-mute block mb-1.5">{t("litReview.grouping")}</label>
          <div className="flex flex-wrap gap-2">
            {GROUPINGS.map((g) => (
              <button
                key={g.value}
                onClick={() => setGrouping(g.value)}
                disabled={genMut.isPending}
                className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                  grouping === g.value
                    ? "bg-litera-accent/15 text-litera-accent border-litera-accent/30"
                    : "border-litera-line text-litera-mute hover:bg-litera-panel"
                }`}
              >
                {t(g.labelKey as any)}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto px-5 py-3">
          {genMut.isPending && (
            <div className="h-full flex items-center justify-center text-litera-mute">
              <div className="text-center">
                <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                <p className="text-sm">{t("litReview.generating")}</p>
              </div>
            </div>
          )}

          {genMut.error && (
            <div className="p-3 bg-red-400/10 border border-red-400/20 rounded-lg text-xs text-red-400">
              {genMut.error instanceof Error ? genMut.error.message : String(genMut.error)}
            </div>
          )}

          {!result && !genMut.isPending && !genMut.error && (
            <div className="h-full flex items-center justify-center text-litera-mute">
              <div className="text-center">
                <PenLine className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm mb-3">{t("litReview.hint")}</p>
                <button
                  onClick={() => genMut.mutate()}
                  className="litera-btn-primary text-xs px-4 py-1.5"
                >
                  {t("litReview.generate")}
                </button>
              </div>
            </div>
          )}

          {result && (
            <textarea
              value={editedMarkdown}
              onChange={(e) => setEditedMarkdown(e.target.value)}
              className="w-full h-full min-h-[300px] bg-transparent text-sm text-litera-text font-mono resize-none focus:outline-none"
              spellCheck={false}
            />
          )}
        </div>

        {/* Footer actions */}
        {result && (
          <div className="px-5 py-3 border-t border-litera-line flex items-center gap-2 shrink-0">
            <span className="text-[10px] text-litera-mute mr-auto">
              {result.model} · {result.prompt_tokens}+{result.completion_tokens} tokens
            </span>
            {onSaveNote && (
              <button
                onClick={() => onSaveNote(editedMarkdown)}
                className="litera-btn text-xs"
              >
                <PenLine className="h-3.5 w-3.5" />
                {t("litReview.saveAsNote")}
              </button>
            )}
            <button onClick={handleCopy} className="litera-btn text-xs">
              {copied ? (
                <>{t("litReview.copied")}</>
              ) : (
                <>
                  <ClipboardCopy className="h-3.5 w-3.5" />
                  {t("litReview.copy")}
                </>
              )}
            </button>
            <button onClick={handleDownload} className="litera-btn-primary text-xs">
              <Download className="h-3.5 w-3.5" />
              {t("litReview.download")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
