import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Atom, Loader2, RefreshCw, ExternalLink, Search, ChevronDown, ChevronRight,
  Rocket, CheckCircle2, ChevronsDown,
} from "lucide-react";
import { api, type ArxivDraft, type Paper } from "@/lib/api";
import { ARXIV_GROUPS, findCategoryLabel } from "@/lib/arxiv-categories";

const DEFAULT_CATEGORY = "physics.optics";
const PAGE_SIZE = 50;

export function BrowsePage() {
  const [category, setCategory] = useState(DEFAULT_CATEGORY);
  const [filter, setFilter] = useState("");
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(["Physics"]));

  // Cumulative list: each "加载更多" call appends PAGE_SIZE more entries via the
  // arxiv `start` offset. arXiv's API caps a single request at 200 entries, so this
  // is how we get past that ceiling.
  const [drafts, setDrafts] = useState<ArxivDraft[]>([]);
  const [exhausted, setExhausted] = useState(false);
  const [firstLoadErr, setFirstLoadErr] = useState<string | null>(null);

  const loadMore = useMutation({
    mutationFn: () => api.arxivListCategory(category, PAGE_SIZE, drafts.length),
    onSuccess: (next) => {
      setDrafts((cur) => [...cur, ...next]);
      if (next.length < PAGE_SIZE) setExhausted(true);
      setFirstLoadErr(null);
    },
    onError: (e: Error) => { if (drafts.length === 0) setFirstLoadErr(e.message); },
  });

  // (Re)load from scratch whenever category changes.
  useEffect(() => {
    setDrafts([]);
    setExhausted(false);
    setFirstLoadErr(null);
    loadMore.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  function refresh() {
    setDrafts([]);
    setExhausted(false);
    setFirstLoadErr(null);
    loadMore.mutate();
  }

  const filtered = filter
    ? drafts.filter((p) => {
        const needle = filter.toLowerCase();
        return (
          p.title.toLowerCase().includes(needle) ||
          p.authors.some((a) => a.toLowerCase().includes(needle)) ||
          (p.abstract_text ?? "").toLowerCase().includes(needle)
        );
      })
    : drafts;

  function toggleGroup(label: string) {
    setOpenGroups((s) => {
      const n = new Set(s);
      if (n.has(label)) n.delete(label); else n.add(label);
      return n;
    });
  }

  const initialLoading = loadMore.isPending && drafts.length === 0;

  return (
    <section className="h-full flex flex-col overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
      {/* sidebar: category tree */}
      <aside className="w-[240px] shrink-0 border-r border-litera-line bg-litera-paper/40 overflow-auto">
        <div className="px-3 py-3 border-b border-litera-line">
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="cs.LG, physics.optics, …"
            className="litera-input w-full text-xs font-mono"
          />
          <p className="text-[10px] text-litera-mute mt-1.5">输入任意 arXiv 分类 ID</p>
        </div>
        <nav className="px-2 py-2">
          {ARXIV_GROUPS.map((g) => {
            const open = openGroups.has(g.label);
            return (
              <div key={g.label} className="mb-1">
                <button
                  onClick={() => toggleGroup(g.label)}
                  className="flex items-center gap-1 w-full px-2 py-1 text-xs text-litera-text/80 hover:text-litera-text"
                >
                  {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  <span className="font-medium uppercase tracking-wider text-[10px]">{g.label}</span>
                </button>
                {open && (
                  <ul className="ml-3 mt-0.5 space-y-0.5">
                    {g.categories.map((c) => (
                      <li key={c.id}>
                        <button
                          onClick={() => setCategory(c.id)}
                          className={
                            "block w-full text-left px-2 py-1 rounded text-[12px] transition-colors " +
                            (c.id === category
                              ? "bg-litera-accent/15 text-litera-accent"
                              : "text-litera-text/70 hover:bg-litera-panel hover:text-litera-text")
                          }
                          title={c.id}
                        >
                          {c.label}
                          <span className="ml-1.5 text-[10px] text-litera-mute font-mono">{c.id.split(".").pop()}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      {/* main */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="border-b border-litera-line px-6 py-3.5 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-serif text-2xl tracking-tight flex items-center gap-2">
              <Atom className="h-5 w-5 text-litera-accent" />
              {findCategoryLabel(category)}
              <span className="text-litera-mute font-mono text-sm">/ {category}</span>
            </h1>
            <p className="text-xs text-litera-mute mt-0.5">
              arXiv 最新提交 · 按投稿时间倒序
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-litera-mute" />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="过滤已加载…"
                className="litera-input pl-7 w-48 text-xs"
              />
            </div>
            <span className="text-[11px] text-litera-mute font-mono">
              已加载 {drafts.length}{exhausted ? " (完)" : ""}
            </span>
            <button onClick={refresh} disabled={loadMore.isPending} className="litera-btn text-xs disabled:opacity-50">
              {loadMore.isPending && drafts.length === 0 ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              刷新
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-auto">
          {initialLoading ? (
            <div className="grid place-items-center h-64 text-sm text-litera-mute">
              <div className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> 正在获取 {category}…</div>
            </div>
          ) : firstLoadErr ? (
            <div className="p-6 text-sm text-red-400/90">✕ {firstLoadErr}</div>
          ) : filtered.length === 0 ? (
            <div className="grid place-items-center h-64 text-sm text-litera-mute">
              {filter ? "过滤后无匹配,清空过滤或加载更多。" : "没有结果。换一个分类。"}
            </div>
          ) : (
            <>
              <ul className="divide-y divide-litera-line">
                {filtered.map((d, i) => (
                  <DraftRow key={(d.arxiv_id ?? "") + i} draft={d} rank={i + 1} />
                ))}
              </ul>
              <div className="p-4 flex items-center justify-center gap-3">
                {exhausted ? (
                  <span className="text-xs text-litera-mute italic">已加载全部 {drafts.length} 条</span>
                ) : (
                  <button
                    onClick={() => loadMore.mutate()}
                    disabled={loadMore.isPending}
                    className="litera-btn text-xs disabled:opacity-50"
                  >
                    {loadMore.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronsDown className="h-3.5 w-3.5" />}
                    {loadMore.isPending ? "加载中…" : `加载更多 ${PAGE_SIZE} 条`}
                  </button>
                )}
                {loadMore.error && drafts.length > 0 && (
                  <span className="text-xs text-red-400/90">✕ {(loadMore.error as Error).message}</span>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      </div>
    </section>
  );
}

function DraftRow({ draft, rank }: { draft: ArxivDraft; rank: number }) {
  const qc = useQueryClient();
  const [saved, setSaved] = useState<Paper | null>(null);
  const add = useMutation({
    mutationFn: () => api.arxivAddWithPdf(draft.arxiv_id!),
    onSuccess: (p) => {
      setSaved(p);
      qc.invalidateQueries({ queryKey: ["papers"] });
    },
  });
  return (
    <li className="px-6 py-3.5 hover:bg-litera-panel/40 transition-colors group">
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-7 text-right font-mono text-[11px] tabular-nums text-litera-mute">
          #{rank}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-litera-text leading-snug">{draft.title}</div>
          <div className="text-xs text-litera-mute mt-1 flex items-center gap-2 flex-wrap">
            <span className="truncate max-w-[480px]">
              {draft.authors.slice(0, 4).join(", ")}{draft.authors.length > 4 ? " et al." : ""}
            </span>
            {draft.year && <span>· {draft.year}</span>}
            {draft.arxiv_id && (
              <a
                href={`https://arxiv.org/abs/${draft.arxiv_id}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-litera-accent2 hover:underline inline-flex items-center gap-0.5"
              >
                arXiv:{draft.arxiv_id} <ExternalLink className="h-2.5 w-2.5" />
              </a>
            )}
          </div>
          {draft.abstract_text && (
            <p className="text-xs text-litera-text/70 mt-1.5 line-clamp-2 leading-relaxed">
              {draft.abstract_text}
            </p>
          )}
          {add.error && (
            <div className="mt-1.5 text-xs text-red-400/90">✕ {(add.error as Error).message}</div>
          )}
        </div>
        <div className="shrink-0">
          {saved ? (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> 已入库
            </span>
          ) : (
            <button
              onClick={() => add.mutate()}
              disabled={add.isPending || !draft.arxiv_id}
              className="litera-btn text-xs whitespace-nowrap disabled:opacity-50"
              title="从 arxiv.org 下载 PDF 并入库"
            >
              {add.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
              下载并入库
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
