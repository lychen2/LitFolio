import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  LibraryBig, FileText, Sparkles, Loader2, BookOpen, X, Search,
  AlertTriangle, Wrench, Compass, Layers, Tag as TagIcon, Plus, Trash2,
  Circle, CircleDot, CircleCheck, Star,
} from "lucide-react";
import { api, type Paper, type QuickReadResult, type ReadStatus } from "@/lib/api";

const STATUS_META: Record<ReadStatus, { label: string; icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  unread:  { label: "Unread",  icon: Circle,      tone: "text-litera-mute" },
  reading: { label: "Reading", icon: CircleDot,   tone: "text-litera-accent2" },
  read:    { label: "Read",    icon: CircleCheck, tone: "text-emerald-400" },
  must:    { label: "Must",    icon: Star,        tone: "text-amber-400" },
};

const STATUS_ORDER: ReadStatus[] = ["unread", "reading", "read", "must"];

export function LibraryPage() {
  const [search, setSearch] = useState("");
  const trimmed = search.trim();

  const { data: papers, isLoading } = useQuery({
    queryKey: ["papers", "list", trimmed],
    queryFn: () =>
      trimmed ? api.papersSearch(trimmed, 200) : api.papersRecent(200),
    refetchInterval: 8000,
  });

  const [reading, setReading] = useState<Paper | null>(null);

  return (
    <section className="h-full flex flex-col">
      <header className="border-b border-litera-line px-6 py-4 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-serif text-2xl tracking-tight">Library</h1>
          <p className="text-sm text-litera-mute">
            {trimmed
              ? `${papers?.length ?? 0} results for "${trimmed}"`
              : papers
              ? `${papers.length} most recent`
              : "Loading…"}
          </p>
        </div>
        <div className="relative w-80 max-w-[40vw]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-litera-mute" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, authors, abstract, TL;DR…"
            className="litera-input pl-9 pr-8 w-full"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-litera-mute hover:text-litera-text"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </header>
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="grid place-items-center h-full text-litera-mute text-sm">Loading…</div>
        ) : !papers || papers.length === 0 ? (
          trimmed ? <NoResults q={trimmed} /> : <Empty />
        ) : (
          <ul className="divide-y divide-litera-line">
            {papers.map((p) => (
              <PaperRow key={p.id} p={p} onQuickRead={() => setReading(p)} />
            ))}
          </ul>
        )}
      </div>
      {reading && <QuickReadDrawer paper={reading} onClose={() => setReading(null)} />}
    </section>
  );
}

function Empty() {
  return (
    <div className="grid place-items-center h-full text-litera-mute">
      <div className="text-center">
        <LibraryBig className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p className="text-sm">No papers yet. Import to get started.</p>
      </div>
    </div>
  );
}

function NoResults({ q }: { q: string }) {
  return (
    <div className="grid place-items-center h-full text-litera-mute">
      <div className="text-center">
        <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No papers match <span className="font-mono">{q}</span>.</p>
      </div>
    </div>
  );
}

function PaperRow({ p, onQuickRead }: { p: Paper; onQuickRead: () => void }) {
  const qc = useQueryClient();
  const tldr = useMutation({
    mutationFn: () => api.paperTldr(p.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["papers"] }),
  });
  const tagsQ = useQuery({
    queryKey: ["paper-tags", p.id],
    queryFn: () => api.paperTags(p.id),
  });

  return (
    <li className="px-6 py-3.5 hover:bg-litera-panel/50 transition-colors group">
      <div className="flex items-start gap-3">
        <StatusToggle paper={p} />
        <FileText className="h-4 w-4 mt-1 text-litera-mute shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-litera-text leading-snug">{p.title}</div>
          <div className="text-xs text-litera-mute mt-0.5 flex items-center gap-2 flex-wrap">
            {p.authors.length > 0 && (
              <span className="truncate max-w-[420px]">
                {p.authors.slice(0, 3).join(", ")}{p.authors.length > 3 ? " et al." : ""}
              </span>
            )}
            {p.year && <span>· {p.year}</span>}
            {p.venue && <span className="truncate">· {p.venue}</span>}
            {p.doi && <span className="font-mono">· {p.doi}</span>}
            {p.arxiv_id && <span className="font-mono">· arXiv:{p.arxiv_id}</span>}
          </div>
          {p.tldr && (
            <div className="text-xs text-litera-text/80 mt-1.5 leading-relaxed flex items-start gap-1.5">
              <Sparkles className="h-3.5 w-3.5 mt-0.5 text-litera-accent shrink-0" />
              <span>{p.tldr}</span>
            </div>
          )}
          {p.key_findings.length > 0 && (
            <ul className="mt-1.5 text-xs text-litera-text/70 ml-5 list-disc space-y-0.5">
              {p.key_findings.slice(0, 3).map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          )}
          {(p.research_question || p.method) && (
            <div className="mt-1.5 text-[11px] flex items-center gap-2 text-litera-accent2">
              <BookOpen className="h-3 w-3" /> Quick-read available
            </div>
          )}
          <TagChipsRow paperId={p.id} tags={tagsQ.data ?? []} />
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => tldr.mutate()}
            disabled={tldr.isPending}
            className="litera-btn text-xs disabled:opacity-50 whitespace-nowrap"
            title="Generate one-sentence summary + key findings"
          >
            {tldr.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            TL;DR
          </button>
          <button onClick={onQuickRead} className="litera-btn text-xs whitespace-nowrap"
            title="Quick deep-read: problem / method / comparison / limitations">
            <BookOpen className="h-3.5 w-3.5" /> Quick read
          </button>
        </div>
      </div>
      {tldr.error && (
        <div className="ml-7 mt-1 text-xs text-red-400/90">✕ {(tldr.error as Error).message}</div>
      )}
    </li>
  );
}

function StatusToggle({ paper }: { paper: Paper }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (next: ReadStatus) => api.paperSetReadStatus(paper.id, next),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["papers"] }),
  });
  const meta = STATUS_META[paper.read_status];
  const Icon = meta.icon;
  function cycle() {
    const idx = STATUS_ORDER.indexOf(paper.read_status);
    const next = STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];
    m.mutate(next);
  }
  return (
    <button
      onClick={cycle}
      disabled={m.isPending}
      className={"mt-0.5 shrink-0 p-0.5 rounded hover:bg-litera-panel transition-colors " + meta.tone}
      title={`Status: ${meta.label} (click to cycle)`}
    >
      {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
    </button>
  );
}

function TagChipsRow({ paperId, tags }: { paperId: string; tags: { id: number; name: string; color: string | null }[] }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const detach = useMutation({
    mutationFn: (tagId: number) => api.paperDetachTag(paperId, tagId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["paper-tags", paperId] });
      qc.invalidateQueries({ queryKey: ["tags-list"] });
    },
  });
  const create = useMutation({
    mutationFn: async (n: string) => {
      let existing = (await api.tagsList()).find((t) => t.name.toLowerCase() === n.toLowerCase());
      const id = existing?.id ?? (await api.tagCreate(n)).id;
      await api.paperAttachTag(paperId, id);
      return id;
    },
    onSuccess: () => {
      setName("");
      setAdding(false);
      qc.invalidateQueries({ queryKey: ["paper-tags", paperId] });
      qc.invalidateQueries({ queryKey: ["tags-list"] });
    },
  });
  return (
    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
      {tags.map((t) => (
        <span
          key={t.id}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] border"
          style={{
            borderColor: t.color ?? "rgba(167,139,250,0.4)",
            color: t.color ?? "#a78bfa",
            backgroundColor: (t.color ?? "#a78bfa") + "1a",
          }}
        >
          <TagIcon className="h-2.5 w-2.5" />
          {t.name}
          <button onClick={() => detach.mutate(t.id)} className="opacity-50 hover:opacity-100 ml-0.5">
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
      {adding ? (
        <span className="inline-flex items-center gap-1">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) create.mutate(name.trim());
              else if (e.key === "Escape") { setAdding(false); setName(""); }
            }}
            placeholder="tag…"
            className="litera-input py-0.5 text-[11px] w-32"
          />
          <button onClick={() => name.trim() && create.mutate(name.trim())} className="text-litera-mute hover:text-litera-text">
            {create.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          </button>
        </span>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] text-litera-mute border border-dashed border-litera-line hover:text-litera-text hover:border-litera-mute"
        >
          <Plus className="h-2.5 w-2.5" /> tag
        </button>
      )}
    </div>
  );
}

function QuickReadDrawer({ paper, onClose }: { paper: Paper; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: latest } = useQuery({
    queryKey: ["paper", paper.id],
    queryFn: () => api.paperGet(paper.id),
    initialData: paper,
  });
  const current = latest ?? paper;
  const m = useMutation({
    mutationFn: () => api.paperQuickRead(paper.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["paper", paper.id] });
      qc.invalidateQueries({ queryKey: ["papers"] });
    },
  });
  const del = useMutation({
    mutationFn: () => api.paperDelete(paper.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["papers"] });
      onClose();
    },
  });

  const hasCached = !!current.research_question && !!current.method && !!current.comparison && !!current.limitations;
  const result: QuickReadResult | null = hasCached
    ? {
        problem: current.research_question ?? "",
        method: current.method ?? "",
        comparison: current.comparison ?? "",
        limitations: current.limitations ?? "",
        model: "(cached)",
        prompt_tokens: 0,
        completion_tokens: 0,
      }
    : m.data ?? null;

  return (
    <div className="fixed inset-0 z-30 flex items-stretch justify-end bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-[640px] max-w-[92vw] h-full bg-litera-paper border-l border-litera-line shadow-2xl flex flex-col">
        <header className="px-5 py-4 border-b border-litera-line flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-litera-accent2 flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5" /> Quick read
            </div>
            <div className="font-serif text-lg leading-snug mt-0.5">{current.title}</div>
            <div className="text-xs text-litera-mute mt-1 truncate">
              {current.authors.slice(0, 4).join(", ")}{current.authors.length > 4 ? " et al." : ""}
              {current.year ? ` · ${current.year}` : ""}
              {current.venue ? ` · ${current.venue}` : ""}
            </div>
          </div>
          <button onClick={onClose} className="text-litera-mute hover:text-litera-text">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="px-5 py-3 border-b border-litera-line flex items-center justify-between gap-2">
          <div className="text-xs text-litera-mute">
            {hasCached ? "Showing cached analysis." : m.isPending ? "Asking the model…" : "Generate four-part analysis."}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { if (confirm("Delete this paper from library?")) del.mutate(); }}
              disabled={del.isPending}
              className="litera-btn text-xs text-red-400/80 hover:text-red-400 disabled:opacity-50"
              title="Delete this paper"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => m.mutate()} disabled={m.isPending} className="litera-btn-primary text-xs disabled:opacity-50">
              {m.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {hasCached ? "Regenerate" : "Run quick read"}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4 space-y-5">
          {!result && !m.isPending && (
            <div className="text-sm text-litera-mute text-center py-12">
              <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-40" />
              No analysis yet. Click <span className="text-litera-text">Run quick read</span>.
              <div className="text-[11px] mt-2">Requires an LLM profile in Settings.</div>
            </div>
          )}
          {m.isPending && !result && (
            <div className="text-sm text-litera-mute flex items-center justify-center gap-2 py-12">
              <Loader2 className="h-4 w-4 animate-spin" /> Generating four-part analysis…
            </div>
          )}
          {result && <ResultBody r={result} />}
          {m.error && (
            <div className="text-sm text-red-400/90 border border-red-400/30 rounded p-3">
              ✕ {(m.error as Error).message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultBody({ r }: { r: QuickReadResult }) {
  return (
    <>
      <Section icon={<Compass className="h-4 w-4" />} label="1 · 解决什么问题" body={r.problem} tone="accent" />
      <Section icon={<Wrench className="h-4 w-4" />}  label="2 · 提出了什么方法" body={r.method} tone="accent" />
      <Section icon={<Layers className="h-4 w-4" />}  label="3 · 和别人有什么不同" body={r.comparison} tone="accent2" />
      <Section icon={<AlertTriangle className="h-4 w-4" />} label="4 · 局限与未解决的问题" body={r.limitations} tone="warn" />
      {r.model && r.model !== "(cached)" && (
        <div className="text-[11px] text-litera-mute pt-2 border-t border-litera-line">
          model: <span className="font-mono">{r.model}</span>
          {" · "}prompt tokens: {r.prompt_tokens}
          {" · "}completion tokens: {r.completion_tokens}
        </div>
      )}
    </>
  );
}

function Section({ icon, label, body, tone }: { icon: React.ReactNode; label: string; body: string; tone: "accent" | "accent2" | "warn" }) {
  const color = tone === "accent" ? "text-litera-accent" : tone === "accent2" ? "text-litera-accent2" : "text-amber-400";
  return (
    <div>
      <div className={"flex items-center gap-1.5 text-xs uppercase tracking-wider mb-1.5 " + color}>
        {icon} {label}
      </div>
      <div className="text-sm leading-relaxed text-litera-text whitespace-pre-line">
        {body || <span className="text-litera-mute italic">(empty)</span>}
      </div>
    </div>
  );
}
