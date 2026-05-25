import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Compass, Loader2, Search, Sparkles, Quote, FlaskConical,
  Calendar, Rocket, CheckCircle2, Wand2,
} from "lucide-react";
import { api, type SearchHit, type TopicReport, type Paper } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";

export function TopicSearchView() {
  const t = useT();
  const [query, setQuery] = useState("");
  const [window, setWindow] = useState(3);
  const [report, setReport] = useState<TopicReport | null>(null);
  const [expandedTerms, setExpandedTerms] = useState<string[] | null>(null);

  const discover = useMutation({
    mutationFn: (q: string) =>
      api.topicDiscover({
        query: q,
        terms: expandedTerms ?? undefined,
        recentLimit: 20,
        classicLimit: 20,
        recentWindowYears: window,
      }),
    onSuccess: (r) => setReport(r),
  });

  const expand = useMutation({
    mutationFn: (raw: string) => api.searchExpandQuery(raw),
    onSuccess: (r) => {
      setExpandedTerms(r.terms);
      setQuery(r.expanded);
    },
  });

  const examples = [
    "diffusion models",
    "retrieval augmented generation",
    "graph neural networks",
    "protein structure prediction",
    "in-context learning",
  ];

  return (
    <section className="h-full flex flex-col">
      <header className="border-b border-litera-line px-6 py-4 flex items-end justify-between gap-6">
        <div>
          <h1 className="font-serif text-2xl tracking-tight flex items-center gap-2">
            <Compass className="h-5 w-5 text-litera-accent" />
            {t("topic.search.heading")}
          </h1>
          <p className="text-sm text-litera-mute">{t("topic.search.subtitle")}</p>
        </div>
      </header>

      <div className="px-6 py-5 border-b border-litera-line">
        <div className="litera-panel p-5 max-w-4xl">
          <label className="text-xs uppercase tracking-wider text-litera-mute">{t("topic.search.label")}</label>
          <div className="flex gap-2 mt-2">
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setExpandedTerms(null); }}
              onKeyDown={(e) => e.key === "Enter" && query.trim() && discover.mutate(query.trim())}
              placeholder={t("topic.search.placeholder")}
              className="litera-input flex-1"
            />
            <button
              onClick={() => query.trim() && expand.mutate(query.trim())}
              disabled={expand.isPending || !query.trim()}
              className="litera-btn text-sm disabled:opacity-50"
              title={t("topic.search.expandTitle")}
            >
              {expand.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              {t("topic.search.expand")}
            </button>
            <div className="flex items-center gap-1.5 text-sm text-litera-mute border border-litera-line rounded-md px-2.5 bg-litera-paper">
              <Calendar className="h-3.5 w-3.5" />
              <span>{t("topic.search.recentEquals")}</span>
              <select
                value={window}
                onChange={(e) => setWindow(parseInt(e.target.value))}
                className="bg-transparent text-litera-text outline-none py-1.5"
              >
                <option value="1">{t("topic.search.window.1")}</option>
                <option value="2">{t("topic.search.window.2")}</option>
                <option value="3">{t("topic.search.window.3")}</option>
                <option value="5">{t("topic.search.window.5")}</option>
              </select>
            </div>
            <button
              onClick={() => query.trim() && discover.mutate(query.trim())}
              disabled={discover.isPending || !query.trim()}
              className="litera-btn-primary disabled:opacity-50"
            >
              {discover.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {t("topic.search.discover")}
            </button>
          </div>
          {expandedTerms && expandedTerms.length > 0 && (
            <div className="mt-2 text-xs text-litera-mute flex items-start gap-1.5 flex-wrap">
              <span className="text-litera-accent2/90">{t("topic.search.expandResult")}</span>
              {expandedTerms.map((t) => (
                <span key={t} className="px-1.5 py-0.5 rounded border border-litera-accent2/30 bg-litera-accent2/5 text-litera-accent2 font-mono text-[11px]">
                  {t}
                </span>
              ))}
              <span className="text-litera-mute italic">- {t("topic.search.expandHint")}</span>
            </div>
          )}
          {expand.error && (
            <div className="mt-2 text-xs text-red-400/90">
              ✕ {t("topic.search.expandFailed", { message: (expand.error as Error).message })}
            </div>
          )}
          {!report && (
            <div className="mt-3 flex items-center gap-2 flex-wrap text-xs">
              <span className="text-litera-mute">{t("topic.search.try")}</span>
              {examples.map((e) => (
                <button
                  key={e}
                  onClick={() => { setQuery(e); discover.mutate(e); }}
                  className="px-2 py-0.5 rounded border border-litera-line text-litera-text/80 hover:bg-litera-panel"
                >
                  {e}
                </button>
              ))}
            </div>
          )}
          {discover.error && (
            <div className="mt-3 text-sm text-red-400/90">✕ {(discover.error as Error).message}</div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden grid grid-cols-2 gap-px bg-litera-line">
        <Column
          icon={<Sparkles className="h-4 w-4" />}
          title={report
            ? t("topic.search.recentTitleRange", { from: report.recent_year_from, to: report.recent_year_to })
            : t("topic.search.recentTitle")}
          subtitle={t("topic.search.recentSubtitle")}
          hits={report?.recent ?? []}
          loading={discover.isPending}
          kind="recent"
        />
        <Column
          icon={<Quote className="h-4 w-4" />}
          title={t("topic.search.classicTitle")}
          subtitle={t("topic.search.classicSubtitle")}
          hits={report?.classic ?? []}
          loading={discover.isPending}
          kind="classic"
        />
      </div>
    </section>
  );
}

function Column({
  icon, title, subtitle, hits, loading, kind,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  hits: SearchHit[];
  loading: boolean;
  kind: "recent" | "classic";
}) {
  const t = useT();
  return (
    <div className="bg-litera-ink flex flex-col min-h-0">
      <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 border-b border-litera-line bg-litera-ink/95 backdrop-blur">
        <div>
          <div className="text-litera-text font-medium flex items-center gap-2">
            <span className={kind === "recent" ? "text-litera-accent" : "text-litera-accent2"}>{icon}</span>
            {title}
          </div>
          <div className="text-xs text-litera-mute">{t("topic.search.count", { subtitle, count: hits.length })}</div>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-8 text-center text-sm text-litera-mute flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("topic.search.loading")}
          </div>
        ) : hits.length === 0 ? (
          <div className="p-8 text-center text-sm text-litera-mute">
            <FlaskConical className="h-8 w-8 mx-auto mb-2 opacity-50" />
            {t("topic.search.empty")}
          </div>
        ) : (
          <ul className="divide-y divide-litera-line">
            {hits.map((h, i) => (
              <HitRow key={(h.paper_id ?? "") + i} h={h} rank={i + 1} kind={kind} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function HitRow({
  h, rank, kind,
}: {
  h: SearchHit; rank: number; kind: "recent" | "classic";
}) {
  const t = useT();
  const qc = useQueryClient();
  const [saved, setSaved] = useState<Paper | null>(null);
  const add = useMutation({
    mutationFn: () => api.arxivAddWithPdf(h.draft.arxiv_id!),
    onSuccess: (p) => {
      setSaved(p);
      qc.invalidateQueries({ queryKey: ["papers"] });
    },
  });
  const cc = h.citation_count;
  const icc = h.influential_citation_count;
  const canAdd = !!h.draft.arxiv_id;
  return (
    <li className="px-5 py-3.5 hover:bg-litera-panel/40 transition-colors group">
      <div className="flex items-start gap-3">
        <div className={
          "shrink-0 w-7 text-right font-mono text-xs tabular-nums " +
          (kind === "recent" ? "text-litera-accent" : "text-litera-accent2")
        }>
          #{rank}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-litera-text leading-snug">{h.draft.title}</div>
          <div className="text-xs text-litera-mute mt-1 flex items-center gap-2 flex-wrap">
            <span className="truncate max-w-[440px]">
              {h.draft.authors.slice(0, 3).join(", ")}{h.draft.authors.length > 3 ? " et al." : ""}
            </span>
            {h.draft.year && <span>· {h.draft.year}</span>}
            {h.draft.venue && <span className="truncate">· {h.draft.venue}</span>}
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-[11px] flex-wrap">
            {cc != null && <Stat label={t("topic.search.cites")} value={cc.toLocaleString()} dim={false} />}
            {icc != null && <Stat label={t("topic.search.influential")} value={icc.toLocaleString()} dim />}
            {h.draft.doi && <span className="font-mono text-litera-mute">doi:{h.draft.doi}</span>}
            {h.draft.arxiv_id && <span className="font-mono text-litera-mute">arXiv:{h.draft.arxiv_id}</span>}
          </div>
          {h.draft.abstract_text && (
            <p className="text-xs text-litera-text/70 mt-2 line-clamp-2 leading-relaxed">
              {h.draft.abstract_text}
            </p>
          )}
          {add.error && (
            <div className="mt-1.5 text-xs text-red-400/90">✕ {(add.error as Error).message}</div>
          )}
        </div>
        <div className="shrink-0">
          {saved ? (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-400 whitespace-nowrap">
              <CheckCircle2 className="h-3.5 w-3.5" /> {t("topic.search.saved")}
            </span>
          ) : canAdd ? (
            <button
              onClick={() => add.mutate()}
              disabled={add.isPending}
              className="litera-btn text-xs whitespace-nowrap disabled:opacity-50"
              title={t("topic.search.downloadAndImportTitle")}
            >
              {add.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
              {t("topic.search.downloadAndImport")}
            </button>
          ) : (
            <span
              className="text-xs text-litera-mute italic whitespace-nowrap"
              title={t("topic.search.manualOnlyTitle")}
            >
              {t("topic.search.manualOnly")}
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

function Stat({ label, value, dim }: { label: string; value: string; dim: boolean }) {
  return (
    <span className={
      "inline-flex items-center gap-1 px-1.5 py-0.5 rounded border " +
      (dim
        ? "border-litera-line text-litera-mute"
        : "border-litera-accent/30 bg-litera-accent/10 text-litera-accent")
    }>
      <span className="font-mono tabular-nums">{value}</span>
      <span className="text-litera-mute">{label}</span>
    </span>
  );
}
