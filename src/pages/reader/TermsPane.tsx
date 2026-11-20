import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookMarked, Spinner, Orbit, Trash2 } from "@/components/icons";
import { api } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";

export function TermsPane({ paperId }: { paperId: string }) {
  const t = useT();
  const qc = useQueryClient();
  const [status, setStatus] = useState<"idle" | "extracting" | "explaining">("idle");
  const list = useQuery({
    queryKey: ["paper-terms", paperId],
    queryFn: () => api.paperTermsList(paperId),
  });
  const generateCandidates = useMutation({
    mutationFn: () => api.paperTermsGenerateCandidates(paperId),
    onMutate: () => setStatus("extracting"),
    onSuccess: (data) => {
      qc.setQueryData(["paper-terms", paperId], data);
      setStatus("explaining");
      explainTerms.mutate();
    },
    onError: () => setStatus("idle"),
  });
  const explainTerms = useMutation({
    mutationFn: () => api.paperTermsExplain(paperId),
    onSuccess: (data) => {
      qc.setQueryData(["paper-terms", paperId], data);
    },
    onSettled: () => setStatus("idle"),
  });
  const remove = useMutation({
    mutationFn: (termId: number) => api.paperTermDelete(paperId, termId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["paper-terms", paperId] }),
  });

  if (list.isLoading) {
    return (
      <div className="h-full grid place-items-center text-sm text-litera-mute">
        <div className="flex items-center gap-2">
          <Spinner className="h-4 w-4 animate-spin" />
          {t("reader.termsLoading")}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto px-4 py-3">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="text-sm text-litera-text">{t("reader.termsTitle")}</div>
          <div className="text-xs text-litera-mute mt-1">
            {t("reader.termsSubtitle")}
          </div>
        </div>
        <button
          onClick={() => generateCandidates.mutate()}
          disabled={generateCandidates.isPending || explainTerms.isPending}
          className="litera-btn text-xs shrink-0"
        >
          {generateCandidates.isPending || explainTerms.isPending ? <Spinner className="h-3.5 w-3.5 animate-spin" /> : <Orbit className="h-3.5 w-3.5" />}
          {list.data && list.data.length > 0 ? t("reader.termsRebuild") : t("reader.termsGenerate")}
        </button>
      </div>

      {status !== "idle" && (
        <div className="mb-3 text-xs text-litera-mute inline-flex items-center gap-2">
          <Spinner className="h-3.5 w-3.5 animate-spin" />
          {status === "extracting" ? t("reader.termsExtracting") : t("reader.termsExplaining")}
        </div>
      )}

      {generateCandidates.error && (
        <div className="mb-3 text-xs text-litera-error break-all">
          {t("reader.termsGenerateFailed", { message: errorMessage(generateCandidates.error) })}
        </div>
      )}
      {explainTerms.error && (
        <div className="mb-3 text-xs text-litera-error break-all">
          {t("reader.termsExplainFailed", { message: errorMessage(explainTerms.error) })}
        </div>
      )}

      {!list.data || list.data.length === 0 ? (
        <div className="text-sm text-litera-mute leading-6">
          {t("reader.termsEmpty")}
        </div>
      ) : (
        <div className="space-y-4">
          {list.data.map((item) => (
            <article key={item.term.id} className="litera-panel p-3 group relative">
              <button
                onClick={() => remove.mutate(item.term.id)}
                disabled={remove.isPending}
                title={t("reader.termsRemove")}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition text-litera-mute hover:text-litera-error disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <div className="text-sm font-medium text-litera-text pr-6">
                {item.term.term}
              </div>
              <div className="mt-1 text-xs leading-relaxed text-litera-accent2/90">
                {item.definition_status === "pending" ? (
                  <span className="inline-flex items-center gap-1.5 text-litera-mute">
                    <Spinner className="h-3 w-3 animate-spin" />
                    {t("reader.termsPendingDefinition")}
                  </span>
                ) : (
                  item.term.local_definition
                )}
              </div>
              {item.term.local_evidence && (
                <div className="mt-2">
                  <div className="text-[11px] uppercase tracking-wider text-litera-mute">{t("reader.termsEvidence")}</div>
                  <p className="mt-1 text-xs leading-relaxed text-litera-text/75 whitespace-pre-wrap">
                    {item.term.local_evidence}
                  </p>
                </div>
              )}
              {item.related.length > 0 && (
                <div className="mt-3 space-y-2">
                  <div className="text-[11px] uppercase tracking-wider text-litera-mute">{t("reader.termsCrossRef")}</div>
                  {item.related.map((related) => (
                    <div
                      key={`${item.term.id}-${related.paper_id}`}
                      className="rounded-md border border-litera-line/70 px-3 py-2"
                    >
                      <div className="flex items-center gap-1.5 text-xs text-litera-text">
                        <BookMarked className="h-3.5 w-3.5 text-litera-accent shrink-0" />
                        <span className="font-medium">{related.paper_title}</span>
                        {related.paper_year ? <span className="text-litera-mute">{related.paper_year}</span> : null}
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-litera-text/75 whitespace-pre-wrap">
                        {related.local_definition}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  try {
    const json = JSON.stringify(error);
    if (json && json !== "{}") return json;
  } catch {
    // fall through to an explicit unknown marker
  }
  return "unknown error";
}
