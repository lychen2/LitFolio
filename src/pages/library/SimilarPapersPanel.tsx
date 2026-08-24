import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Sparkles, X } from "lucide-react";
import { api, type Recommendation } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";
import { useState } from "react";

export function SimilarPapersPanel({
  paperId,
  paperTitle,
  onClose,
}: {
  paperId: string;
  paperTitle: string;
  onClose: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [results, setResults] = useState<Recommendation[] | null>(null);

  const findMut = useMutation({
    mutationFn: () => api.paperSimilar(paperId),
    onSuccess: (data) => setResults(data),
  });

  const addMut = useMutation({
    mutationFn: (rec: Recommendation) =>
      api.addFromSearch({
        paper_id: rec.paper_id,
        citation_count: rec.citation_count,
        influential_citation_count: null,
        draft: {
          title: rec.title,
          authors: rec.authors,
          year: rec.year,
          venue: rec.venue,
          doi: rec.doi,
          arxiv_id: rec.arxiv_id,
          abstract_text: rec.abstract_snippet,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["papers"] });
    },
  });

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-litera-ink/40 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[520px] max-w-[94vw] h-full bg-litera-paper border-l border-litera-line shadow-2xl flex flex-col"
      >
        <header className="px-4 py-3 border-b border-litera-line flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-litera-accent" />
            <span className="text-sm font-medium">{t("similar.title")}</span>
          </div>
          <button onClick={onClose} className="text-litera-mute hover:text-litera-text">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="px-4 py-3 border-b border-litera-line">
          <p className="text-xs text-litera-mute mb-2 truncate">{paperTitle}</p>
          <button
            onClick={() => findMut.mutate()}
            disabled={findMut.isPending}
            className="litera-btn-primary text-xs w-full disabled:opacity-50"
          >
            {findMut.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {findMut.isPending ? t("similar.searching") : t("similar.find")}
          </button>
          {findMut.error && (
            <p className="text-xs text-litera-error mt-2">
              {findMut.error instanceof Error ? findMut.error.message : String(findMut.error)}
            </p>
          )}
        </div>

        <div className="flex-1 overflow-auto px-4 py-3 space-y-3">
          {results === null && !findMut.isPending && (
            <p className="text-sm text-litera-mute text-center py-8">{t("similar.hint")}</p>
          )}
          {results !== null && results.length === 0 && (
            <p className="text-sm text-litera-mute text-center py-8">{t("similar.empty")}</p>
          )}
          {results?.map((rec) => (
            <RecCard
              key={rec.paper_id}
              rec={rec}
              adding={addMut.isPending}
              onAdd={() => addMut.mutate(rec)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function RecCard({
  rec,
  adding,
  onAdd,
}: {
  rec: Recommendation;
  adding: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="border border-litera-line rounded-lg p-3 bg-litera-panel/30 hover:bg-litera-panel/50 transition-colors">
      <h4 className="text-sm font-medium text-litera-text leading-snug">{rec.title}</h4>
      <p className="text-xs text-litera-mute mt-1">
        {rec.authors.slice(0, 3).join(", ")}
        {rec.authors.length > 3 && ` +${rec.authors.length - 3}`}
        {rec.year && ` · ${rec.year}`}
        {rec.venue && ` · ${rec.venue}`}
      </p>
      {rec.abstract_snippet && (
        <p className="text-xs text-litera-text/70 mt-2 line-clamp-3">{rec.abstract_snippet}</p>
      )}
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-2 text-[10px] text-litera-mute">
          {rec.citation_count !== null && <span>{rec.citation_count} citations</span>}
          {rec.doi && <span className="font-mono">{rec.doi}</span>}
        </div>
        <button
          onClick={onAdd}
          disabled={adding}
          className="litera-btn text-[11px] px-2 py-0.5 disabled:opacity-50"
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>
    </div>
  );
}
