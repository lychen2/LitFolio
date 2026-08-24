import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Compass, Loader2, Search, Sparkles, Quote, Calendar, Wand2,
} from "lucide-react";
import { api, type TopicReport } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";
import { Column } from "./TopicSearchResults";
import { loadCurrentTopicReport, saveCurrentTopicReport } from "./topicSearchStorage";
import { PageHeader } from "@/components/PageHeader";

export function TopicSearchView() {
  const t = useT();
  const [query, setQuery] = useState("");
  const [window, setWindow] = useState(3);
  const [report, setReport] = useState<TopicReport | null>(() => loadCurrentTopicReport()?.report ?? null);
  const [expandedTerms, setExpandedTerms] = useState<string[] | null>(() => loadCurrentTopicReport()?.expandedTerms ?? null);

  const discover = useMutation({
    mutationFn: (q: string) =>
      api.topicDiscover({
        query: q,
        terms: expandedTerms ?? undefined,
        recentLimit: 20,
        classicLimit: 20,
        recentWindowYears: window,
      }),
    onSuccess: (r) => { setReport(r); saveCurrentTopicReport(r, expandedTerms); },
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
      <PageHeader
        icon={<Compass className="h-5 w-5 text-litera-accent" aria-hidden="true" />}
        title={t("topic.search.heading")}
        subtitle={t("topic.search.subtitle")}
      />

      <div className="border-b border-litera-border px-5 py-5 max-[900px]:px-4">
        <div className="litera-panel p-5 max-w-4xl">
          <label className="text-xs uppercase tracking-wider text-litera-mute">{t("topic.search.label")}</label>
          <div className="mt-2 flex flex-wrap gap-2">
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
            <div className="mt-2 text-xs text-litera-error">
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
            <div className="mt-3 text-sm text-litera-error">✕ {(discover.error as Error).message}</div>
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
