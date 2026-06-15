import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2, RefreshCw, Search } from "lucide-react";
import { api, type Paper } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";

/// Editable DOI field for the paper detail drawer. Lets the user supply (or
/// correct) a DOI for a paper whose metadata wasn't recognized at import time,
/// then re-fetch title/authors/year/venue/abstract from CrossRef in place.
export function DoiEnrichRow({
  paper, onEnriched,
}: {
  paper: Paper;
  onEnriched: (updated: Paper) => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [doi, setDoi] = useState(paper.doi ?? "");

  const enrich = useMutation({
    mutationFn: (value: string) => api.paperEnrichFromDoi(paper.id, value),
    onSuccess: (updated) => {
      onEnriched(updated);
      qc.invalidateQueries({ queryKey: ["papers"] });
      qc.invalidateQueries({ queryKey: ["paper", paper.id] });
    },
  });

  const trimmed = doi.trim();
  const officialUrl = doiOfficialUrl(trimmed);
  const hasDoi = !!paper.doi;

  return (
    <dd className="space-y-1">
      <div className="flex items-center gap-1.5">
        <input
          value={doi}
          onChange={(e) => setDoi(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && trimmed && !enrich.isPending) enrich.mutate(trimmed);
          }}
          placeholder={t("paper.detail.doiPlaceholder")}
          className="litera-input py-0.5 text-xs font-mono flex-1 min-w-0"
        />
        {officialUrl && (
          <a
            href={officialUrl}
            target="_blank"
            rel="noreferrer"
            className="litera-btn text-[11px] px-2 py-0.5 shrink-0"
            title={t("paper.detail.openDoiOfficial")}
            aria-label={t("paper.detail.openDoiOfficial")}
          >
            <ExternalLink className="h-3 w-3" />
            {t("paper.detail.officialLink")}
          </a>
        )}
        <button
          onClick={() => trimmed && enrich.mutate(trimmed)}
          disabled={!trimmed || enrich.isPending}
          className="litera-btn text-[11px] px-2 py-0.5 disabled:opacity-50 shrink-0"
          title={hasDoi ? t("paper.detail.refetchMeta") : t("paper.detail.fetchMeta")}
        >
          {enrich.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : hasDoi ? (
            <RefreshCw className="h-3 w-3" />
          ) : (
            <Search className="h-3 w-3" />
          )}
          {hasDoi ? t("paper.detail.refetchMeta") : t("paper.detail.fetchMeta")}
        </button>
      </div>
      {enrich.isError && (
        <div className="text-[11px] text-red-400/90">
          ✕ {t("paper.detail.enrichFailed")}: {(enrich.error as Error).message}
        </div>
      )}
      {enrich.isSuccess && (
        <div className="text-[11px] text-litera-accent">{t("paper.detail.enrichSuccess")}</div>
      )}
    </dd>
  );
}

export function doiOfficialUrl(doi: string | null | undefined): string | null {
  const trimmed = doi?.trim();
  if (!trimmed) return null;
  const normalized = trimmed
    .replace(/^doi:\s*/i, "")
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .trim();
  if (!normalized) return null;
  return `https://doi.org/${encodeURIComponent(normalized).replace(/%2F/g, "/")}`;
}
