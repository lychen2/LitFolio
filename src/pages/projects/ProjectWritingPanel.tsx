import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ClipboardCopy, FileText, Loader2, ScrollText } from "lucide-react";
import { useT } from "@/i18n/I18nProvider";
import { api, type ResearchProject } from "@/lib/api";

export function ProjectWritingPanel({ project }: { project: ResearchProject }) {
  const t = useT();
  const [copied, setCopied] = useState<"outline" | "manifest" | null>(null);
  const outline = useMutation({
    mutationFn: () => api.projectWritingOutline(project.id),
    onSuccess: async (result) => {
      await navigator.clipboard.writeText(result.markdown);
      setCopied("outline");
    },
  });
  const manifest = useMutation({
    mutationFn: () => api.projectSourceManifest(project.id),
    onSuccess: async (result) => {
      await navigator.clipboard.writeText(result.markdown);
      setCopied("manifest");
    },
  });
  const result = outline.data;

  return (
    <section className="border-t border-litera-line px-6 py-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-serif text-lg flex items-center gap-2">
            <FileText className="h-4 w-4 text-litera-accent" />
            {t("projects.writing")}
          </h2>
          <p className="mt-1 text-xs text-litera-mute">{t("projects.writingHint")}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => manifest.mutate()}
            disabled={manifest.isPending}
            className="litera-btn text-xs disabled:opacity-50"
          >
            {manifest.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScrollText className="h-3.5 w-3.5" />}
            {t("projects.sourceManifest")}
          </button>
          <button
            onClick={() => outline.mutate()}
            disabled={outline.isPending}
            className="litera-btn text-xs disabled:opacity-50"
          >
            {outline.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
            {t("projects.writingGenerate")}
          </button>
        </div>
      </div>
      {(outline.error || manifest.error) && (
        <div className="mt-3 text-xs text-red-400/90">{((outline.error ?? manifest.error) as Error).message}</div>
      )}
      {copied === "outline" && result && (
        <div className="mt-3 text-xs text-emerald-400">
          {t("projects.writingCopied", {
            papers: result.paper_count,
            sources: result.source_count,
            sections: result.section_count,
          })}
        </div>
      )}
      {copied === "manifest" && manifest.data && (
        <div className="mt-3 text-xs text-emerald-400">
          {t("projects.sourceManifestCopied", {
            papers: manifest.data.paper_count,
            pdfs: manifest.data.pdf_count,
            notes: manifest.data.note_section_count,
          })}
        </div>
      )}
      {result ? (
        <pre className="mt-3 max-h-80 overflow-auto rounded-md border border-litera-line bg-litera-paper/60 p-4 text-xs leading-relaxed text-litera-text/85 whitespace-pre-wrap">
          {result.markdown}
        </pre>
      ) : (
        <div className="mt-3 rounded-md border border-litera-line p-4 text-sm text-litera-mute">
          {t("projects.writingEmpty")}
        </div>
      )}
    </section>
  );
}
