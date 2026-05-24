import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2, Plus, FileText, Hash, Globe, Upload, Search, BookPlus,
} from "lucide-react";
import { api, pickPdfFiles, type SearchHit } from "@/lib/api";

type Tab = "pdf" | "bibtex" | "doi" | "search";

export function ImportPage() {
  const [tab, setTab] = useState<Tab>("doi");
  return (
    <section className="h-full flex flex-col">
      <header className="border-b border-litera-line px-6 py-4 flex items-end justify-between gap-6">
        <div>
          <h1 className="font-serif text-2xl tracking-tight">Import</h1>
          <p className="text-sm text-litera-mute">
            Drag PDFs · paste DOIs · upload BibTeX · search the web
          </p>
        </div>
        <LibraryStats />
      </header>
      <nav className="px-6 pt-4 flex gap-1">
        <TabButton on={tab === "doi"} onClick={() => setTab("doi")} icon={<Hash className="h-3.5 w-3.5" />} label="DOI / arXiv" />
        <TabButton on={tab === "bibtex"} onClick={() => setTab("bibtex")} icon={<FileText className="h-3.5 w-3.5" />} label="BibTeX" />
        <TabButton on={tab === "pdf"} onClick={() => setTab("pdf")} icon={<Upload className="h-3.5 w-3.5" />} label="PDF files" />
        <TabButton on={tab === "search"} onClick={() => setTab("search")} icon={<Globe className="h-3.5 w-3.5" />} label="Search" />
      </nav>
      <div className="flex-1 overflow-auto p-6">
        {tab === "doi" && <DoiArxivTab />}
        {tab === "bibtex" && <BibtexTab />}
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
      <div><span className="text-litera-text">{count ?? "—"}</span> papers in library</div>
      <div className="font-mono mt-0.5 max-w-[420px] truncate">{root ?? ""}</div>
    </div>
  );
}

function DoiArxivTab() {
  const qc = useQueryClient();
  const [value, setValue] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const importDoi = useMutation({
    mutationFn: (v: string) => api.importDoi(v),
    onSuccess: (p) => { setResult(`✓ ${p.title}`); setValue(""); qc.invalidateQueries({ queryKey: ["papers"] }); },
    onError: (e: Error) => setResult(`✕ ${e.message}`),
  });
  const importArxiv = useMutation({
    mutationFn: (v: string) => api.importArxiv(v),
    onSuccess: (p) => { setResult(`✓ ${p.title}`); setValue(""); qc.invalidateQueries({ queryKey: ["papers"] }); },
    onError: (e: Error) => setResult(`✕ ${e.message}`),
  });
  const isDoi = /^10\./.test(value.trim()) || value.includes("doi.org");
  const isArxiv = /^\d{4}\.\d{4,5}/.test(value.trim()) || value.toLowerCase().includes("arxiv");
  const busy = importDoi.isPending || importArxiv.isPending;
  function submit() {
    const v = value.trim();
    if (!v) return;
    if (isArxiv && !isDoi) importArxiv.mutate(v); else importDoi.mutate(v);
  }
  return (
    <div className="max-w-2xl">
      <div className="litera-panel p-5">
        <label className="text-xs uppercase tracking-wider text-litera-mute">Paste a DOI or arXiv id</label>
        <div className="flex gap-2 mt-2">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="10.1038/nature12345  ·  arXiv:1706.03762"
            className="litera-input flex-1 font-mono"
          />
          <button onClick={submit} disabled={busy || !value.trim()} className="litera-btn-primary disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add
          </button>
        </div>
        <div className="mt-2 text-xs text-litera-mute">
          {value && (isArxiv && !isDoi ? "Detected: arXiv id" : isDoi ? "Detected: DOI" : "Will try DOI first")}
        </div>
        {result && <div className="mt-3 text-sm">{result}</div>}
      </div>
    </div>
  );
}

function BibtexTab() {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: (t: string) => api.importBibtex(t),
    onSuccess: (papers) => {
      setResult(`✓ Imported ${papers.length} paper${papers.length === 1 ? "" : "s"}`);
      setText("");
      qc.invalidateQueries({ queryKey: ["papers"] });
    },
    onError: (e: Error) => setResult(`✕ ${e.message}`),
  });
  return (
    <div className="max-w-3xl">
      <div className="litera-panel p-5">
        <label className="text-xs uppercase tracking-wider text-litera-mute">Paste BibTeX</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"@article{key,\n  title = {…},\n  author = {…},\n  year = {…}\n}"}
          className="litera-input w-full h-56 mt-2 font-mono text-xs leading-relaxed"
          spellCheck={false}
        />
        <div className="flex items-center gap-3 mt-3">
          <button
            onClick={() => m.mutate(text)}
            disabled={m.isPending || !text.trim()}
            className="litera-btn-primary disabled:opacity-50"
          >
            {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Parse and import
          </button>
          {result && <div className="text-sm">{result}</div>}
        </div>
      </div>
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
        <p className="text-sm text-litera-text">Select PDF files to import into your library</p>
        <p className="text-xs text-litera-mute mt-1">
          We extract title / author / DOI from each file and copy it under{" "}
          <span className="font-mono">papers/&lt;id&gt;/original.pdf</span>.
        </p>
        <div className="mt-4 flex items-center justify-center gap-2">
          <button onClick={pick} className="litera-btn">
            <Upload className="h-4 w-4" /> Choose PDFs…
          </button>
          {picked.length > 0 && (
            <button
              onClick={() => m.mutate(picked)}
              disabled={m.isPending}
              className="litera-btn-primary disabled:opacity-50"
            >
              {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Import {picked.length}
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
          <div className="text-litera-text">✓ Imported {result.ok}{result.failed.length ? `, ${result.failed.length} failed` : ""}.</div>
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
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [adding, setAdding] = useState<string | null>(null);
  const { data, isFetching, error } = useQuery({
    queryKey: ["search", submitted],
    queryFn: () => (submitted ? api.searchPapers(submitted, 15) : Promise.resolve([])),
    enabled: !!submitted,
  });
  const addM = useMutation({
    mutationFn: (h: SearchHit) => api.addFromSearch(h),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["papers"] }),
  });
  return (
    <div className="max-w-3xl space-y-4">
      <div className="litera-panel p-5">
        <label className="text-xs uppercase tracking-wider text-litera-mute">Search Semantic Scholar</label>
        <div className="flex gap-2 mt-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setSubmitted(q.trim())}
            placeholder="e.g. attention is all you need"
            className="litera-input flex-1"
          />
          <button
            onClick={() => setSubmitted(q.trim())}
            disabled={!q.trim()}
            className="litera-btn-primary disabled:opacity-50"
          >
            <Search className="h-4 w-4" /> Search
          </button>
        </div>
        <p className="mt-2 text-xs text-litera-mute">
          api.semanticscholar.org · rate-limited to 80 req / 5 min in this app.
        </p>
      </div>
      {error && <div className="text-sm text-red-400/90">✕ {(error as Error).message}</div>}
      {isFetching && <div className="text-sm text-litera-mute flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Searching…</div>}
      {data && data.length > 0 && (
        <ul className="divide-y divide-litera-line border border-litera-line rounded-md overflow-hidden">
          {data.map((h, i) => {
            const key = h.paper_id ?? String(i);
            const busy = adding === key && addM.isPending;
            return (
              <li key={key} className="p-3.5 hover:bg-litera-panel/60 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-litera-text">{h.draft.title}</div>
                    <div className="text-xs text-litera-mute mt-1">
                      {h.draft.authors.slice(0, 4).join(", ")}{h.draft.authors.length > 4 ? " et al." : ""}
                      {h.draft.year ? ` · ${h.draft.year}` : ""}
                      {h.draft.venue ? ` · ${h.draft.venue}` : ""}
                    </div>
                    {h.draft.abstract_text && (
                      <p className="text-xs text-litera-text/70 mt-1.5 line-clamp-3">{h.draft.abstract_text}</p>
                    )}
                  </div>
                  <button
                    onClick={() => { setAdding(key); addM.mutate(h); }}
                    disabled={busy}
                    className="litera-btn shrink-0 disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BookPlus className="h-3.5 w-3.5" />}
                    Add
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {submitted && !isFetching && data && data.length === 0 && (
        <div className="text-sm text-litera-mute">No results.</div>
      )}
    </div>
  );
}
