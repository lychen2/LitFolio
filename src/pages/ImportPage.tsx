import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ExternalLink, Loader2, FileText, Hash, Globe, Upload, Search, Save, Rocket, FolderOpen, Rss,
} from "lucide-react";
import { open as openInBrowser } from "@tauri-apps/plugin-shell";
import {
  api, pickPdfFiles, pickSinglePdf, type SearchHit, type ArxivDraft,
} from "@/lib/api";

import { useT } from "@/i18n/I18nProvider";
import { ImportSidebar } from "./import/ImportSidebar";

type Tab = "pdf" | "arxiv_doi" | "search";

interface ImportSource {
  /** Original feed item id, sent back via feed_item_link_paper after save. */
  fromFeedItem: string | null;
  /** Source URL (arXiv abs page, DOI link, journal page, …). Used for one-click 在浏览器打开. */
  link: string | null;
  /** Optional title hint surfaced as the source banner subtitle. */
  title: string | null;
  /** Extracted identifier if we recognise the link (arXiv ID or DOI). Pre-fills the arXiv/DOI tab input. */
  prefill: string | null;
}

export function ImportPage() {
  const t = useT();
  const [params] = useSearchParams();
  const source: ImportSource = {
    fromFeedItem: params.get("fromFeedItem"),
    link: params.get("link"),
    title: params.get("title"),
    prefill: params.get("link") ? extractIdentifier(params.get("link")!) : null,
  };
  const [tab, setTab] = useState<Tab>(source.prefill ? "arxiv_doi" : "arxiv_doi");

  return (
    <section className="h-full flex flex-col">
      <header className="border-b border-litera-line px-6 py-4 flex items-end justify-between gap-6">
        <div>
          <h1 className="font-serif text-2xl tracking-tight">{t("import.title")}</h1>
          <p className="text-sm text-litera-mute">
            {t("import.subtitle")}
          </p>
        </div>
        <LibraryStats />
      </header>
      <ImportSourceBanner source={source} />
      <nav className="px-6 pt-4 flex gap-1">
        <TabButton on={tab === "arxiv_doi"} onClick={() => setTab("arxiv_doi")} icon={<Hash className="h-3.5 w-3.5" />} label={t("import.tab.arxivDoi")} />
        <TabButton on={tab === "pdf"} onClick={() => setTab("pdf")} icon={<Upload className="h-3.5 w-3.5" />} label={t("import.tab.pdf")} />
        <TabButton on={tab === "search"} onClick={() => setTab("search")} icon={<Globe className="h-3.5 w-3.5" />} label={t("import.tab.search")} />
      </nav>
      <div className="flex-1 overflow-auto p-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            {tab === "arxiv_doi" && <ArxivDoiTab source={source} />}
            {tab === "pdf" && <PdfTab />}
            {tab === "search" && <SearchTab />}
          </div>
          <ImportSidebar />
        </div>
      </div>
    </section>
  );
}

/// Surface the inbound link prominently so the user can: 1) see *why* they're
/// on this page (来自 RSS 订阅), 2) one-click open the source page in their
/// browser to grab the PDF when arXiv auto-download isn't an option (DOIs etc).
function ImportSourceBanner({ source }: { source: ImportSource }) {
  const t = useT();
  if (!source.link && !source.fromFeedItem) return null;
  function open() {
    if (source.link) openInBrowser(source.link).catch(() => undefined);
  }
  return (
    <div className="border-b border-litera-line px-6 py-3 bg-litera-accent/5 flex items-center gap-3">
      {source.fromFeedItem ? (
        <Rss className="h-4 w-4 text-litera-accent shrink-0" />
      ) : (
        <ExternalLink className="h-4 w-4 text-litera-accent shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-xs uppercase tracking-wider text-litera-mute">
          {source.fromFeedItem ? t("import.fromFeed") : t("import.source")}
        </div>
        {source.title && (
          <div className="text-sm text-litera-text truncate" title={source.title}>
            {source.title}
          </div>
        )}
        {source.link && (
          <button
            onClick={open}
            className="mt-0.5 font-mono text-[11px] text-litera-accent hover:underline truncate max-w-full block text-left"
          >
            {source.link}
          </button>
        )}
      </div>
      {source.link && (
        <button
          onClick={open}
          className="litera-btn text-xs flex items-center gap-1.5 shrink-0"
        >
          <ExternalLink className="h-3.5 w-3.5" /> {t("import.openOrigin")}
        </button>
      )}
    </div>
  );
}

/// Best-effort pull an arXiv ID or DOI out of the source link so the user
/// doesn't have to paste it. Anything we don't recognise leaves the input
/// blank and the user can type the identifier by hand.
function extractIdentifier(url: string): string | null {
  const arxiv = url.match(/arxiv\.org\/(?:abs|pdf|html|format)\/([\w\-./]+?)(?:v\d+)?(?:\.pdf)?(?:[?#].*)?$/i);
  if (arxiv) return arxiv[1];
  const doi = url.match(/doi\.org\/(10\.\d{4,9}\/[^\s?#]+)/i);
  if (doi) return doi[1];
  return null;
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
  const t = useT();
  const { data: count } = useQuery({ queryKey: ["papers", "count"], queryFn: api.papersCount, refetchInterval: 5000 });
  const { data: root } = useQuery({ queryKey: ["library", "root"], queryFn: api.libraryRoot });
  return (
    <div className="text-right text-xs text-litera-mute">
      <div>{t("import.stats.count", { count: String(count ?? "—") })}</div>
      <div className="font-mono mt-0.5 max-w-[420px] truncate">{root ?? ""}</div>
    </div>
  );
}

function ArxivDoiTab({ source }: { source: ImportSource }) {
  const t = useT();
  const qc = useQueryClient();
  const [value, setValue] = useState(source.prefill ?? "");
  const [draft, setDraft] = useState<ArxivDraft | null>(null);
  const [sourceKind, setSourceKind] = useState<"arxiv" | "doi" | null>(null);
  const [selectedPdf, setSelectedPdf] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (source.prefill) {
      setValue(source.prefill);
      fetchMeta.mutate(source.prefill);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.prefill]);

  const trimmed = value.trim();
  const isArxiv = /^\d{4}\.\d{4,5}/.test(trimmed) || trimmed.toLowerCase().includes("arxiv");
  const isDoi = !isArxiv && (/^10\./.test(trimmed) || trimmed.includes("doi.org"));

  async function linkBackToFeed(paperId: string) {
    if (!source.fromFeedItem) return;
    try {
      await api.feedItemLinkPaper(source.fromFeedItem, paperId);
      qc.invalidateQueries({ queryKey: ["feeds"] });
      qc.invalidateQueries({ queryKey: ["feed-items"] });
    } catch {
      // Best-effort
    }
  }

  const fetchMeta = useMutation({
    mutationFn: async (v: string): Promise<{ draft: ArxivDraft; kind: "arxiv" | "doi" }> => {
      const looksArxiv = /^\d{4}\.\d{4,5}/.test(v) || v.toLowerCase().includes("arxiv");
      const looksDoi = !looksArxiv && (/^10\./.test(v) || v.includes("doi.org"));
      if (looksArxiv) {
        const id = v.replace(/^arxiv:/i, "").trim();
        const d = await api.prepareArxivDraft(id);
        return { draft: d, kind: "arxiv" };
      }
      if (looksDoi) {
        const d = await api.prepareDoiDraft(v);
        return { draft: d, kind: "doi" };
      }
      throw new Error(t("import.error.invalidId"));
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
      if (!draft || !selectedPdf) throw new Error(t("import.error.missingMeta"));
      return api.paperSaveWithPdf(draft, selectedPdf);
    },
    onSuccess: async (p) => {
      setSuccess(t("import.saved", { title: p.title }));
      await linkBackToFeed(p.id);
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
    onSuccess: async (p) => {
      setSuccess(t("import.downloadedSaved", { title: p.title }));
      await linkBackToFeed(p.id);
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
      setError(t("import.error.invalidId"));
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
        <label className="text-xs uppercase tracking-wider text-litera-mute">{t("import.step1.label")}</label>
        <div className="flex gap-2 mt-2">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder={t("import.step1.placeholder")}
            className="litera-input flex-1 font-mono"
          />
          <button onClick={submit} disabled={fetching || !trimmed} className="litera-btn-primary disabled:opacity-50">
            {fetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {t("import.step1.fetch")}
          </button>
        </div>
        <div className="mt-2 text-xs text-litera-mute">{t("import.step1.hint")}</div>
        {error && <div className="mt-3 text-sm text-red-400/90">✕ {error}</div>}
        {success && <div className="mt-3 text-sm text-litera-accent">{success}</div>}
      </div>

      {draft && (
        <div className="litera-panel p-5 space-y-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-litera-mute mb-1.5">{t("import.step2.label")}</div>
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
            <div className="text-xs uppercase tracking-wider text-litera-mute mb-2">{t("import.step3.label")}</div>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={pickPdf} disabled={saving} className="litera-btn text-sm disabled:opacity-50">
                <FolderOpen className="h-4 w-4" /> {t("import.step3.pickPdf")}
              </button>
              {sourceKind === "arxiv" && (
                <button
                  onClick={() => autoDownload.mutate()}
                  disabled={saving}
                  className="litera-btn text-sm disabled:opacity-50"
                  title={t("import.step3.autoDownloadTitle")}
                >
                  {autoDownload.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                  {t("import.step3.autoDownload")}
                </button>
              )}
              <button
                onClick={() => saveWithPdf.mutate()}
                disabled={!selectedPdf || saving}
                className="litera-btn-primary text-sm disabled:opacity-50"
              >
                {saveWithPdf.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {t("import.step3.save")}
              </button>
              <button onClick={reset} disabled={saving} className="litera-btn text-xs ml-auto disabled:opacity-50">
                {t("import.step3.cancel")}
              </button>
            </div>
            <div className="mt-2 text-xs">
              {selectedPdf ? (
                <span className="text-litera-accent">
                  {t("import.step3.selected", { path: "" })} <span className="font-mono text-[11px] text-litera-text/80">{selectedPdf}</span>
                </span>
              ) : (
                <span className="text-litera-mute italic">{t("import.step3.notSelected")}</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PdfTab() {
  const t = useT();
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
        <p className="text-sm text-litera-text">{t("import.pdfTab.desc")}</p>
        <p className="text-xs text-litera-mute mt-1">
          {t("import.pdfTab.hint", { path: "papers/<id>/original.pdf" })}
        </p>
        <div className="mt-4 flex items-center justify-center gap-2">
          <button onClick={pick} className="litera-btn">
            <Upload className="h-4 w-4" /> {t("import.pdfTab.pick")}
          </button>
          {picked.length > 0 && (
            <button
              onClick={() => m.mutate(picked)}
              disabled={m.isPending}
              className="litera-btn-primary disabled:opacity-50"
            >
              {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              {t("import.pdfTab.importBtn", { count: String(picked.length) })}
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
        <p className="mt-4 text-xs text-litera-mute">{t("import.pdfTab.dragHint")}</p>
      </div>
      {result && (
        <div className="litera-panel p-4 text-sm space-y-2">
          <div className="text-litera-text">
            {result.failed.length === 0
              ? t("import.pdfTab.done", { ok: String(result.ok) })
              : t("import.pdfTab.doneWithFail", { ok: String(result.ok), fail: String(result.failed.length) })}
          </div>
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
          <button
            onClick={() => setSubmitted(q.trim())}
            disabled={!q.trim()}
            className="litera-btn-primary disabled:opacity-50"
          >
            <Search className="h-4 w-4" /> {t("common.search")}
          </button>
        </div>
        <p className="mt-2 text-xs text-litera-mute">{t("import.search.hint")}</p>
      </div>
      {error && <div className="text-sm text-red-400/90">✕ {(error as Error).message}</div>}
      {isFetching && <div className="text-sm text-litera-mute flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> {t("import.search.searching")}</div>}
      {data && data.length > 0 && (
        <ul className="divide-y divide-litera-line border border-litera-line rounded-md overflow-hidden">
          {data.map((h, i) => (
            <SearchHitRow key={(h.paper_id ?? "") + i} h={h} />
          ))}
        </ul>
      )}
      {submitted && !isFetching && data && data.length === 0 && (
        <div className="text-sm text-litera-mute">{t("import.search.empty")}</div>
      )}
    </div>
  );
}

function SearchHitRow({ h }: { h: SearchHit }) {
  const t = useT();
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
        setMsg({ kind: "ok", text: t("import.saved", { title: p.title }) });
        qc.invalidateQueries({ queryKey: ["papers"] });
      }
    },
    onError: (e: Error) => setMsg({ kind: "err", text: e.message }),
  });

  const arxivAuto = useMutation({
    mutationFn: () => api.arxivAddWithPdf(h.draft.arxiv_id!),
    onSuccess: (p) => {
      setMsg({ kind: "ok", text: t("import.downloaded", { title: p.title }) });
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
            title={t("import.search.pickSaveTitle")}
          >
            {savePdf.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderOpen className="h-3.5 w-3.5" />}
            {t("import.search.pickSave")}
          </button>
          {h.draft.arxiv_id && (
            <button
              onClick={() => arxivAuto.mutate()}
              disabled={arxivAuto.isPending}
              className="litera-btn text-xs whitespace-nowrap disabled:opacity-50"
              title={t("import.search.arxivAutoTitle")}
            >
              {arxivAuto.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
              {t("import.search.arxivAuto")}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
