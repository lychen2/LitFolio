import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Merge, Search } from "lucide-react";
import { api, type DuplicatePair, type Paper } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";

export function DuplicatesPanel() {
  const t = useT();
  const queryClient = useQueryClient();
  const [pairs, setPairs] = useState<DuplicatePair[] | null>(null);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const scanMut = useMutation({
    mutationFn: api.paperScanDuplicates,
    onSuccess: (data) => { setPairs(data); setDismissed(new Set()); },
  });
  const mergeMut = useMutation({
    mutationFn: ({ keepId, mergeId }: { keepId: string; mergeId: string }) => api.paperMerge(keepId, mergeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["papers"] });
      queryClient.invalidateQueries({ queryKey: ["paper"] });
      queryClient.invalidateQueries({ queryKey: ["paper-tags"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["graph"] });
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      queryClient.invalidateQueries({ queryKey: ["comparisons"] });
      scanMut.mutate();
    },
  });
  const visiblePairs = pairs?.filter((_, index) => !dismissed.has(index)) ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-medium text-litera-text mb-1">{t("dedup.title")}</h3>
        <p className="text-xs text-litera-mute">
          {pairs === null
            ? t("dedup.description")
            : visiblePairs.length === 0
            ? t("dedup.noDuplicates")
            : t("dedup.found", { count: String(visiblePairs.length) })}
        </p>
      </div>
      <button onClick={() => scanMut.mutate()} disabled={scanMut.isPending} className="litera-btn-primary text-xs disabled:opacity-50">
        {scanMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
        {scanMut.isPending ? t("dedup.scanning") : t("dedup.scan")}
      </button>
      {scanMut.error && <div className="text-sm text-litera-error">✕ {(scanMut.error as Error).message}</div>}
      {mergeMut.error && <div className="text-sm text-litera-error">✕ {(mergeMut.error as Error).message}</div>}
      {visiblePairs.map((pair) => {
        const globalIdx = pairs!.indexOf(pair);
        return (
          <div key={globalIdx} className="border border-litera-line rounded-lg p-3 space-y-2">
            <div className="text-[10px] text-litera-mute uppercase tracking-wider">
              {t("dedup.reason")}: {reasonLabel(pair.reason, t)}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <PaperMiniCard paper={pair.paper_a} />
              <PaperMiniCard paper={pair.paper_b} />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => confirm(t("dedup.mergeConfirm")) && mergeMut.mutate({ keepId: pair.paper_a.id, mergeId: pair.paper_b.id })}
                disabled={mergeMut.isPending}
                className="litera-btn-primary text-xs flex-1"
              >
                <Merge className="h-3 w-3" /> {t("dedup.keepLeft")}
              </button>
              <button
                onClick={() => confirm(t("dedup.mergeConfirm")) && mergeMut.mutate({ keepId: pair.paper_b.id, mergeId: pair.paper_a.id })}
                disabled={mergeMut.isPending}
                className="litera-btn-primary text-xs flex-1"
              >
                <Merge className="h-3 w-3" /> {t("dedup.keepRight")}
              </button>
              <button onClick={() => setDismissed((s) => new Set(s).add(globalIdx))} className="litera-btn text-xs">
                {t("dedup.dismiss")}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function reasonLabel(reason: string, t: ReturnType<typeof useT>) {
  if (reason === "doi_match") return t("dedup.reasonDoi");
  if (reason === "arxiv_match") return t("dedup.reasonArxiv");
  return t("dedup.reasonTitle");
}

function PaperMiniCard({ paper }: { paper: Paper }) {
  return (
    <div className="bg-litera-panel/50 rounded p-2 text-xs">
      <div className="font-medium text-litera-text truncate">{paper.title}</div>
      <div className="text-litera-mute mt-0.5">
        {paper.authors.slice(0, 2).join(", ")}
        {paper.year && ` · ${paper.year}`}
      </div>
      {paper.doi && <div className="text-[10px] text-litera-mute mt-0.5 truncate">DOI: {paper.doi}</div>}
      {paper.arxiv_id && <div className="text-[10px] text-litera-mute truncate">arXiv: {paper.arxiv_id}</div>}
    </div>
  );
}
