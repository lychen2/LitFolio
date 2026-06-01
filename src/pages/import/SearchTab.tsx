import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, CheckCircle2, FolderOpen, Loader2, Rocket, Search } from "lucide-react";
import { api, pickSinglePdf, type SearchHit } from "@/lib/api";
import { useImportedArxivIds } from "@/hooks/useImportedArxivIds";
import { useT } from "@/i18n/I18nProvider";
import { CandidateStatusPill } from "@/components/candidates/CandidateStatusPill";
import { candidateIsHidden, useCandidateLookup } from "@/hooks/useCandidateState";

export function SearchTab() {
  const t = useT();
  const [q, setQ] = useState("");
  const [submitted, setSubmitted] = useState("");
  const { data, isFetching, error } = useQuery({
    queryKey: ["search", submitted],
    queryFn: () => (submitted ? api.searchPapers(submitted, 15) : Promise.resolve([] as SearchHit[])),
    enabled: !!submitted,
  });
  return (
    <div className="max-w-3xl space-y-4">
      <div className="litera-panel p-5">
        <label className="text-xs uppercase tracking-wider text-litera-mute">{t("import.search.label")}</label>
        <div className="flex gap-2 mt-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setSubmitted(q.trim())}
            placeholder={t("import.search.placeholder")}
            className="litera-input flex-1"
          />
          <button onClick={() => setSubmitted(q.trim())} disabled={!q.trim()} className="litera-btn-primary disabled:opacity-50">
            <Search className="h-4 w-4" /> {t("common.search")}
          </button>
        </div>
        <p className="mt-2 text-xs text-litera-mute">{t("import.search.hint")}</p>
      </div>
      {error && <div className="text-sm text-red-400/90">✕ {(error as Error).message}</div>}
      {isFetching && <div className="text-sm text-litera-mute flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> {t("import.search.searching")}</div>}
      {data && data.length > 0 && (
        <ul className="divide-y divide-litera-line border border-litera-line rounded-md overflow-hidden">
          {data.map((h, i) => <SearchHitRow key={(h.paper_id ?? "") + i} h={h} />)}
        </ul>
      )}
      {submitted && !isFetching && data && data.length === 0 && <div className="text-sm text-litera-mute">{t("import.search.empty")}</div>}
    </div>
  );
}

function SearchHitRow({ h }: { h: SearchHit }) {
  const t = useT();
  const qc = useQueryClient();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const { data: importedIds } = useImportedArxivIds();
  const { findCandidate } = useCandidateLookup();
  const candidateDraft = searchHitToCandidate(h);
  const syncedCandidate = findCandidate(candidateDraft);
  const alreadyImported = useMemo(
    () => importedIds?.includes(h.draft.arxiv_id ?? "") ?? false,
    [importedIds, h.draft.arxiv_id],
  );
  const savePdf = useMutation({
    mutationFn: async () => {
      const pdf = await pickSinglePdf();
      if (!pdf) return null;
      return api.paperSaveWithPdf(h.draft, pdf);
    },
    onSuccess: (p) => {
      if (!p) return;
      setMsg({ kind: "ok", text: t("import.saved", { title: p.title }) });
      qc.invalidateQueries({ queryKey: ["papers"] });
    },
    onError: (e: Error) => setMsg({ kind: "err", text: e.message }),
  });
  const arxivAuto = useMutation({
    mutationFn: () => {
      if (!h.draft.arxiv_id) throw new Error("Missing arXiv ID");
      return api.arxivAddWithPdf(h.draft.arxiv_id);
    },
    onSuccess: (p) => {
      setMsg({ kind: "ok", text: t("import.downloaded", { title: p.title }) });
      qc.invalidateQueries({ queryKey: ["papers"] });
    },
    onError: (e: Error) => setMsg({ kind: "err", text: e.message }),
  });
  const candidate = useMutation({
    mutationFn: () => api.candidateUpsert(candidateDraft),
    onSuccess: () => {
      setMsg({ kind: "ok", text: t("candidate.added") });
      qc.invalidateQueries({ queryKey: ["candidates"] });
    },
    onError: (e: Error) => setMsg({ kind: "err", text: e.message }),
  });
  if (candidateIsHidden(syncedCandidate)) return null;

  return (
    <li className="p-3.5 hover:bg-litera-panel/60 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-litera-text">
            {h.draft.title}
            {syncedCandidate && <span className="ml-2 align-middle"><CandidateStatusPill status={syncedCandidate.status} /></span>}
          </div>
          <div className="text-xs text-litera-mute mt-1">
            {h.draft.authors.slice(0, 4).join(", ")}{h.draft.authors.length > 4 ? " et al." : ""}
            {h.draft.year ? ` · ${h.draft.year}` : ""}
            {h.draft.venue ? ` · ${h.draft.venue}` : ""}
            {h.draft.arxiv_id ? ` · arXiv:${h.draft.arxiv_id}` : ""}
          </div>
          {h.draft.abstract_text && <p className="text-xs text-litera-text/70 mt-1.5 line-clamp-3">{h.draft.abstract_text}</p>}
          {msg && <div className={"mt-1.5 text-xs " + (msg.kind === "ok" ? "text-litera-accent" : "text-red-400/90")}>{msg.text}</div>}
        </div>
        <SearchHitActions
          alreadyImported={alreadyImported}
          hasArxiv={!!h.draft.arxiv_id}
          savePending={savePdf.isPending}
          autoPending={arxivAuto.isPending}
          candidatePending={candidate.isPending}
          onSave={() => savePdf.mutate()}
          onAuto={() => arxivAuto.mutate()}
          onCandidate={() => candidate.mutate()}
        />
      </div>
    </li>
  );
}

function searchHitToCandidate(h: SearchHit) {
  return {
    ...h.draft,
    source_type: "semantic_scholar",
    source_url: h.paper_id ? `https://www.semanticscholar.org/paper/${h.paper_id}` : null,
  };
}

function SearchHitActions({
  alreadyImported, hasArxiv, savePending, autoPending, candidatePending, onSave, onAuto, onCandidate,
}: {
  alreadyImported: boolean;
  hasArxiv: boolean;
  savePending: boolean;
  autoPending: boolean;
  candidatePending: boolean;
  onSave: () => void;
  onAuto: () => void;
  onCandidate: () => void;
}) {
  const t = useT();
  if (alreadyImported) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-400 whitespace-nowrap">
        <CheckCircle2 className="h-3.5 w-3.5" /> 已入库
      </span>
    );
  }
  return (
    <div className="shrink-0 flex flex-col items-end gap-1.5">
      <button onClick={onCandidate} disabled={candidatePending} className="litera-btn text-xs whitespace-nowrap disabled:opacity-50" title={t("candidate.add")}>
        {candidatePending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
        {t("candidate.addShort")}
      </button>
      <button onClick={onSave} disabled={savePending} className="litera-btn text-xs whitespace-nowrap disabled:opacity-50" title={t("import.search.pickSaveTitle")}>
        {savePending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderOpen className="h-3.5 w-3.5" />}
        {t("import.search.pickSave")}
      </button>
      {hasArxiv && (
        <button onClick={onAuto} disabled={autoPending} className="litera-btn text-xs whitespace-nowrap disabled:opacity-50" title={t("import.search.arxivAutoTitle")}>
          {autoPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
          {t("import.search.arxivAuto")}
        </button>
      )}
    </div>
  );
}
