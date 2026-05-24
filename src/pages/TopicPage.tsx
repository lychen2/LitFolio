import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Compass, Loader2, Search, Sparkles, Quote, FlaskConical,
  Calendar, Rocket, CheckCircle2,
} from "lucide-react";
import { api, type SearchHit, type TopicReport, type Paper } from "@/lib/api";

export function TopicPage() {
  const [query, setQuery] = useState("");
  const [window, setWindow] = useState(3);
  const [report, setReport] = useState<TopicReport | null>(null);

  const discover = useMutation({
    mutationFn: (q: string) =>
      api.topicDiscover({
        query: q,
        recentLimit: 20,
        classicLimit: 20,
        recentWindowYears: window,
      }),
    onSuccess: (r) => setReport(r),
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
            主题发现
          </h1>
          <p className="text-sm text-litera-mute">
            扫描主题内最新重要文献和经典之作。
          </p>
        </div>
      </header>

      <div className="px-6 py-5 border-b border-litera-line">
        <div className="litera-panel p-5 max-w-4xl">
          <label className="text-xs uppercase tracking-wider text-litera-mute">主题</label>
          <div className="flex gap-2 mt-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && query.trim() && discover.mutate(query.trim())}
              placeholder="例如:retrieval augmented generation"
              className="litera-input flex-1"
            />
            <div className="flex items-center gap-1.5 text-sm text-litera-mute border border-litera-line rounded-md px-2.5 bg-litera-paper">
              <Calendar className="h-3.5 w-3.5" />
              <span>最近 =</span>
              <select
                value={window}
                onChange={(e) => setWindow(parseInt(e.target.value))}
                className="bg-transparent text-litera-text outline-none py-1.5"
              >
                <option value="1">近 1 年</option>
                <option value="2">近 2 年</option>
                <option value="3">近 3 年</option>
                <option value="5">近 5 年</option>
              </select>
            </div>
            <button
              onClick={() => query.trim() && discover.mutate(query.trim())}
              disabled={discover.isPending || !query.trim()}
              className="litera-btn-primary disabled:opacity-50"
            >
              {discover.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              发现
            </button>
          </div>
          {!report && (
            <div className="mt-3 flex items-center gap-2 flex-wrap text-xs">
              <span className="text-litera-mute">试试:</span>
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
          title={report ? `最新重要 (${report.recent_year_from}–${report.recent_year_to})` : "最新重要"}
          subtitle="按窗口期内引用数排序"
          hits={report?.recent ?? []}
          loading={discover.isPending}
          kind="recent"
        />
        <Column
          icon={<Quote className="h-4 w-4" />}
          title="经典"
          subtitle="该主题历史引用最高的文献"
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
  return (
    <div className="bg-litera-ink flex flex-col min-h-0">
      <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3 border-b border-litera-line bg-litera-ink/95 backdrop-blur">
        <div>
          <div className="text-litera-text font-medium flex items-center gap-2">
            <span className={kind === "recent" ? "text-litera-accent" : "text-litera-accent2"}>{icon}</span>
            {title}
          </div>
          <div className="text-xs text-litera-mute">{subtitle} · 共 {hits.length} 篇</div>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-8 text-center text-sm text-litera-mute flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> 正在查询 Semantic Scholar…
          </div>
        ) : hits.length === 0 ? (
          <div className="p-8 text-center text-sm text-litera-mute">
            <FlaskConical className="h-8 w-8 mx-auto mb-2 opacity-50" />
            还没有结果。上方运行一次发现。
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
            {cc != null && (
              <Stat label="cites" value={cc.toLocaleString()} dim={false} />
            )}
            {icc != null && (
              <Stat label="influential" value={icc.toLocaleString()} dim />
            )}
            {h.draft.doi && (
              <span className="font-mono text-litera-mute">doi:{h.draft.doi}</span>
            )}
            {h.draft.arxiv_id && (
              <span className="font-mono text-litera-mute">arXiv:{h.draft.arxiv_id}</span>
            )}
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
              <CheckCircle2 className="h-3.5 w-3.5" /> 已入库
            </span>
          ) : canAdd ? (
            <button
              onClick={() => add.mutate()}
              disabled={add.isPending}
              className="litera-btn text-xs whitespace-nowrap disabled:opacity-50"
              title="从 arxiv.org 下载 PDF 并入库"
            >
              {add.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
              下载并入库
            </button>
          ) : (
            <span
              className="text-xs text-litera-mute italic whitespace-nowrap"
              title="非 arXiv 来源,暂不支持自动下载,请到导入页手动绑定 PDF"
            >
              非 arXiv · 需手动
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
