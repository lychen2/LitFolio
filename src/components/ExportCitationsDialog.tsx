import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ClipboardCopy, Download, FileText, Loader2, X } from "lucide-react";
import { api } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";

const FORMATS = [
  { value: "bibtex", ext: "bib", mime: "application/x-bibtex" },
  { value: "ris", ext: "ris", mime: "application/x-research-info-systems" },
  { value: "apa", ext: "txt", mime: "text/plain" },
  { value: "ieee", ext: "txt", mime: "text/plain" },
  { value: "gb/t7714", ext: "txt", mime: "text/plain" },
  { value: "chicago", ext: "txt", mime: "text/plain" },
] as const;

export function ExportCitationsDialog({
  paperIds,
  onClose,
}: {
  paperIds: string[];
  onClose: () => void;
}) {
  const t = useT();
  const [format, setFormat] = useState<string>("bibtex");
  const [copied, setCopied] = useState(false);

  const exportMut = useMutation({
    mutationFn: () => api.exportCitations(paperIds, format),
  });

  const handleCopy = async () => {
    const text = await exportMut.mutateAsync();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = async () => {
    const text = await exportMut.mutateAsync();
    const fmt = FORMATS.find((f) => f.value === format) ?? FORMATS[0];
    const date = new Date().toISOString().slice(0, 10);
    const filename = `litera-export-${date}.${fmt.ext}`;
    const blob = new Blob([text], { type: fmt.mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-litera-ink/40 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[420px] max-w-[90vw] bg-litera-paper border border-litera-line rounded-xl shadow-2xl p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-litera-accent" />
            <span className="font-medium">{t("citations.title")}</span>
          </div>
          <button onClick={onClose} className="text-litera-mute hover:text-litera-text">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-xs text-litera-mute mb-4">
          {paperIds.length} {paperIds.length === 1 ? "paper" : "papers"} selected
        </p>

        <div className="mb-4">
          <label className="text-xs text-litera-mute block mb-1.5">{t("citations.format")}</label>
          <div className="flex flex-wrap gap-2">
            {FORMATS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFormat(f.value)}
                className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                  format === f.value
                    ? "bg-litera-accent/15 text-litera-accent border-litera-accent/30"
                    : "border-litera-line text-litera-mute hover:bg-litera-panel"
                }`}
              >
                {t(`citations.${f.value === "gb/t7714" ? "gbt" : f.value}` as any)}
              </button>
            ))}
          </div>
        </div>

        {exportMut.error && (
          <p className="text-xs text-red-400 mb-3">
            {exportMut.error instanceof Error ? exportMut.error.message : String(exportMut.error)}
          </p>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            disabled={exportMut.isPending}
            className="litera-btn text-xs flex-1 disabled:opacity-50"
          >
            {exportMut.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ClipboardCopy className="h-3.5 w-3.5" />
            )}
            {copied ? t("citations.copied") : t("citations.copy")}
          </button>
          <button
            onClick={handleDownload}
            disabled={exportMut.isPending}
            className="litera-btn-primary text-xs flex-1 disabled:opacity-50"
          >
            {exportMut.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            {t("citations.download")}
          </button>
        </div>
      </div>
    </div>
  );
}
