import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2, FileText, Hash, Globe, Upload, Search, Save, Rocket, FolderOpen,
} from "lucide-react";
import {
  api, pickPdfFiles, pickSinglePdf, type SearchHit, type ArxivDraft,
} from "@/lib/api";

type Tab = "pdf" | "arxiv_doi" | "search";

export function ImportPage() {
  const [tab, setTab] = useState<Tab>("arxiv_doi");
  return (
    <section className="h-full flex flex-col">
      <header className="border-b border-litera-line px-6 py-4 flex items-end justify-between gap-6">
        <div>
          <h1 className="font-serif text-2xl tracking-tight">导入</h1>
          <p className="text-sm text-litera-mute">
            先取元数据,再绑定 PDF。每篇文献必须有 PDF。
          </p>
        </div>
        <LibraryStats />
      </header>
      <nav className="px-6 pt-4 flex gap-1">
        <TabButton on={tab === "arxiv_doi"} onClick={() => setTab("arxiv_doi")} icon={<Hash className="h-3.5 w-3.5" />} label="arXiv 或 DOI" />
        <TabButton on={tab === "pdf"} onClick={() => setTab("pdf")} icon={<Upload className="h-3.5 w-3.5" />} label="PDF 文件" />
        <TabButton on={tab === "search"} onClick={() => setTab("search")} icon={<Globe className="h-3.5 w-3.5" />} label="搜索" />
      </nav>
      <div className="flex-1 overflow-auto p-6">
        {tab === "arxiv_doi" && <ArxivDoiTab />}
        {tab === "pdf" && <PdfTab />}
        {tab === "search" && <SearchTab />}
      </div>
    </section>
  );
}

function TabButton({ on, onClick, icon, label }: { on: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={
        "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border transition-colors " +
        (on
          ? "border-litera-accent/40 bg-litera-accent/10 text-litera-accent"
          : "border-litera-line text-litera-text/80 hover:bg-litera-panel")
      }
    >
      {icon} {label}
    </button>
  );
}

function LibraryStats() {
  const { data: count } = useQuery({ queryKey: ["papers", "count"], queryFn: api.papersCount, refetchInterval: 5000 });
  const { data: root } = useQuery({ queryKey: ["library", "root"], queryFn: api.libraryRoot });
  return (
    <div className="text-right text-xs text-litera-mute">
      <div>文献库目前 <span className="text-litera-text">{count ?? "—"}</span> 篇</div>
      <div className="font-mono mt-0.5 max-w-[420px] truncate">{root ?? ""}</div>
    </div>
  );
}

function ArxivDoiTab() {
  const qc = useQueryClient();
  const [value, setValue] = useState("");
  const [draft, setDraft] = useState<ArxivDraft | null>(null);
  const [sourceKind, setSourceKind] = useState<"arxiv" | "doi" | null>(null);
  const [selectedPdf, setSelectedPdf] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const trimmed = value.trim();
  const isArxiv = /^\d{4}\.\d{4,5}/.test(trimmed) || trimmed.toLowerCase().includes("arxiv");
  const isDoi = !isArxiv && (/^10\./.test(trimmed) || trimmed.includes("doi.org"));

  const fetchMeta = useMutation({
    mutationFn: async (v: string): Promise<{ draft: ArxivDraft; kind: "arxiv" | "doi" }> => {
      if (isArxiv) {
        const id = v.replace(/^arxiv:/i, "").trim();
        const d = await api.prepareArxivDraft(id);
        return { draft: d, kind: "arxiv" };
      }
      const d = await api.prepareDoiDraft(v);
      return { draft: d, kind: "doi" };
    },
    onSuccess: ({ draft, kind }) => {
      setDraft(draft);
      setSourceKind(kind);
      setError(null);
      setSuccess(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const saveWithPdf = useMutation({
    mutationFn: () => {
      if (!draft || !selectedPdf) throw new Error("缺少元数据或 PDF 路径");
      return api.paperSaveWithPdf(draft, selectedPdf);
    },
    onSuccess: (p) => {
      setSuccess(`✓ 已保存:${p.title}`);
      reset();
      qc.invalidateQueries({ queryKey: ["papers"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const autoDownload = useMutation({
    mutationFn: () => {
      const id = draft?.arxiv_id ?? trimmed.replace(/^arxiv:/i, "").trim();
      return api.arxivAddWithPdf(id);
    },
    onSuccess: (p) => {
      setSuccess(`✓ 已下载并保存:${p.title}`);
      reset();
      qc.invalidateQueries({ queryKey: ["papers"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  function reset() {
    setValue("");
    setDraft(null);
    setSourceKind(null);
    setSelectedPdf(null);
  }

  function submit() {
    if (!trimmed) return;
    if (!isArxiv && !isDoi) {
      setError("请输入 arXiv ID(例如 1706.03762)或 DOI(例如 10.1234/xyz)。");
      return;
    }
    setError(null);
    setSuccess(null);
    fetchMeta.mutate(trimmed);
  }

  async function pickPdf() {
    try {
      const path = await pickSinglePdf();
      if (path) setSelectedPdf(path);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const fetching = fetchMeta.isPending;
  const saving = saveWithPdf.isPending || autoDownload.isPending;

  return (
    <div className="max-w-2xl space-y-4">
      <div className="litera-panel p-5">
        <label className="text-xs uppercase tracking-wider text-litera-mute">第 1 步 · 粘贴 arXiv ID 或 DOI</label>
        <div className="flex gap-2 mt-2">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="1706.03762  ·  arXiv:2310.06825  ·  10.1145/3530819"
            className="litera-input flex-1 font-mono"
          />
          <button onClick={submit} disabled={fetching || !trimmed} className="litera-btn-primary disabled:opacity-50">
            {fetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            查询元数据
          </button>
        </div>
        <div className="mt-2 text-xs text-litera-mute">
          arXiv 可一键自动下载 PDF · DOI 来源需要本地选择 PDF 文件。
        </div>
        {error && <div className="mt-3 text-sm text-red-400/90">✕ {error}</div>}
        {success && <div className="mt-3 text-sm text-litera-accent">{success}</div>}
      </div>

      {draft && (
        <div className="litera-panel p-5 space-y-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-litera-mute mb-1.5">第 2 步 · 元数据预览</div>
            <div className="font-serif text-lg leading-snug text-litera-text">{draft.title}</div>
            <div className="text-xs text-litera-mute mt-1 flex items-center gap-2 flex-wrap">
              {draft.authors.length > 0 && (
                <span>{draft.authors.slice(0, 5).join(", ")}{draft.authors.length > 5 ? " et al." : ""}</span>
              )}
              {draft.year && <span>· {draft.year}</span>}
              {draft.venue && <span>· {draft.venue}</span>}
              {draft.doi && <span className="font-mono">· DOI: {draft.doi}</span>}
              {draft.arxiv_id && <span className="font-mono">· arXiv: {draft.arxiv_id}</span>}
            </div>
            {draft.abstract_text && (
              <p className="text-xs text-litera-text/80 mt-2 leading-relaxed line-clamp-6">
                {draft.abstract_text}
              </p>
            )}
          </div>

          <div className="border-t border-litera-line pt-4">
            <div className="text-xs uppercase tracking-wider text-litera-mute mb-2">第 3 步 · 绑定 PDF</div>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={pickPdf} disabled={saving} className="litera-btn text-sm disabled:opacity-50">
                <FolderOpen className="h-4 w-4" /> 选择本地 PDF 文件…
              </button>
              {sourceKind === "arxiv" && (
                <button
                  onClick={() => autoDownload.mutate()}
                  disabled={saving}
                  className="litera-btn text-sm disabled:opacity-50"
                  title="从 arxiv.org/pdf 直接下载"
                >
                  {autoDownload.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                  🚀 自动下载 PDF
                </button>
              )}
              <button
                onClick={() => saveWithPdf.mutate()}
                disabled={!selectedPdf || saving}
                className="litera-btn-primary text-sm disabled:opacity-50"
              >
                {saveWithPdf.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                💾 保存到库
              </button>
              <button onClick={reset} disabled={saving} className="litera-btn text-xs ml-auto disabled:opacity-50">
                取消
              </button>
            </div>
            <div className="mt-2 text-xs">
              {selectedPdf ? (
                <span className="text-litera-accent">
                  已选: <span className="font-mono text-[11px] text-litera-text/80">{selectedPdf}</span>
                </span>
              ) : (
                <span className="text-litera-mute italic">还未选择 PDF</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PdfTab() {
  const qc = useQueryClient();
  const [picked, setPicked] = useState<string[]>([]);
  const [result, setResult] = useState<{ ok: number; failed: { path: string; error: string }[] } | null>(null);

  const m = useMutation({
    mutationFn: (paths: string[]) => api.importPdfFiles(paths),
    onSuccess: (s) => {
      setResult({ ok: s.imported.length, failed: s.failed });
      setPicked([]);
      qc.invalidateQueries({ queryKey: ["papers"] });
    },
    onError: (e: Error) => setResult({ ok: 0, failed: [{ path: "(all)", error: e.message }] }),
  });

  async function pick() {
    const files = await pickPdfFiles();
    if (files && files.length) setPicked(files);
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="litera-panel p-8 text-center">
        <Upload className="h-10 w-10 mx-auto mb-3 text-litera-mute" />
        <p className="text-sm text-litera-text">
          选择本地 PDF 文件加入文献库。
        </p>
        <p className="text-xs text-litera-mute mt-1">
          会从首页提取标题 / 作者 / DOI 等元数据,文件复制到{" "}
          <span className="font-mono">papers/&lt;id&gt;/original.pdf</span>。
        </p>
        <div className="mt-4 flex items-center justify-center gap-2">
          <button onClick={pick} className="litera-btn">
            <Upload className="h-4 w-4" /> 选择 PDF 文件…
          </button>
          {picked.length > 0 && (
            <button
              onClick={() => m.mutate(picked)}
              disabled={m.isPending}
              className="litera-btn-primary disabled:opacity-50"
            >
              {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              导入 {picked.length} 篇
            </button>
          )}
        </div>
        {picked.length > 0 && (
          <div className="mt-4 text-left text-xs text-litera-mute font-mono max-h-40 overflow-auto border border-litera-line rounded p-2">
            {picked.map((p) => (
              <div key={p} className="truncate">{p}</div>
            ))}
          </div>
        )}
      </div>
      {result && (
        <div className="litera-panel p-4 text-sm space-y-2">
          <div className="text-litera-text">✓ 已导入 {result.ok} 篇{result.failed.length ? `,${result.failed.length} 篇失败` : ""}。</div>
          {result.failed.map((f, i) => (
            <div key={i} className="text-xs text-red-400/90 font-mono">
              ✕ <span className="text-litera-mute">{f.path}</span> — {f.error}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SearchTab() {
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
        <label className="text-xs uppercase tracking-wider text-litera-mute">搜索 Semantic Scholar</label>
        <div className="flex gap-2 mt-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setSubmitted(q.trim())}
            placeholder="例如:attention is all you need"
            className="litera-input flex-1"
          />
          <button
            onClick={() => setSubmitted(q.trim())}
            disabled={!q.trim()}
            className="litera-btn-primary disabled:opacity-50"
          >
            <Search className="h-4 w-4" /> 搜索
          </button>
        </div>
        <p className="mt-2 text-xs text-litera-mute">
          搜索结果只显示元数据 · 入库需要绑定本地 PDF · arXiv 条目可尝试自动下载。
        </p>
      </div>
      {error && <div className="text-sm text-red-400/90">✕ {(error as Error).message}</div>}
      {isFetching && <div className="text-sm text-litera-mute flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> 搜索中…</div>}
      {data && data.length > 0 && (
        <ul className="divide-y divide-litera-line border border-litera-line rounded-md overflow-hidden">
          {data.map((h, i) => (
            <SearchHitRow key={(h.paper_id ?? "") + i} h={h} />
          ))}
        </ul>
      )}
      {submitted && !isFetching && data && data.length === 0 && (
        <div className="text-sm text-litera-mute">未找到结果。</div>
      )}
    </div>
  );
}

function SearchHitRow({ h }: { h: SearchHit }) {
  const qc = useQueryClient();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const savePdf = useMutation({
    mutationFn: async () => {
      const pdf = await pickSinglePdf();
      if (!pdf) return null;
      const p = await api.paperSaveWithPdf(h.draft, pdf);
      return p;
    },
    onSuccess: (p) => {
      if (p) {
        setMsg({ kind: "ok", text: `✓ 已保存:${p.title}` });
        qc.invalidateQueries({ queryKey: ["papers"] });
      }
    },
    onError: (e: Error) => setMsg({ kind: "err", text: e.message }),
  });

  const arxivAuto = useMutation({
    mutationFn: () => api.arxivAddWithPdf(h.draft.arxiv_id!),
    onSuccess: (p) => {
      setMsg({ kind: "ok", text: `✓ 已下载:${p.title}` });
      qc.invalidateQueries({ queryKey: ["papers"] });
    },
    onError: (e: Error) => setMsg({ kind: "err", text: e.message }),
  });

  return (
    <li className="p-3.5 hover:bg-litera-panel/60 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-litera-text">{h.draft.title}</div>
          <div className="text-xs text-litera-mute mt-1">
            {h.draft.authors.slice(0, 4).join(", ")}{h.draft.authors.length > 4 ? " et al." : ""}
            {h.draft.year ? ` · ${h.draft.year}` : ""}
            {h.draft.venue ? ` · ${h.draft.venue}` : ""}
            {h.draft.arxiv_id ? ` · arXiv:${h.draft.arxiv_id}` : ""}
          </div>
          {h.draft.abstract_text && (
            <p className="text-xs text-litera-text/70 mt-1.5 line-clamp-3">{h.draft.abstract_text}</p>
          )}
          {msg && (
            <div className={"mt-1.5 text-xs " + (msg.kind === "ok" ? "text-litera-accent" : "text-red-400/90")}>
              {msg.text}
            </div>
          )}
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1.5">
          <button
            onClick={() => savePdf.mutate()}
            disabled={savePdf.isPending}
            className="litera-btn text-xs whitespace-nowrap disabled:opacity-50"
            title="选择本地 PDF 后入库"
          >
            {savePdf.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderOpen className="h-3.5 w-3.5" />}
            选择 PDF 后保存
          </button>
          {h.draft.arxiv_id && (
            <button
              onClick={() => arxivAuto.mutate()}
              disabled={arxivAuto.isPending}
              className="litera-btn text-xs whitespace-nowrap disabled:opacity-50"
              title="从 arxiv.org 直接下载 PDF"
            >
              {arxivAuto.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
              🚀 尝试 arXiv 自动下载
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
