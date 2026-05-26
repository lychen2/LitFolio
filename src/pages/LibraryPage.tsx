import { memo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  LibraryBig, FileText, Sparkles, Loader2, BookOpen, X, Search,
  AlertTriangle, Wrench, Compass, Layers, Tag as TagIcon, Plus, Trash2,
  Circle, CircleDot, CircleCheck, Star, Languages, Paperclip, RefreshCw,
} from "lucide-react";
import { api, pickSinglePdf, type Paper, type QuickReadResult, type ReadStatus } from "@/lib/api";
import { FolderPicker } from "./library/FolderPicker";
import { FolderSidebar } from "./library/FolderSidebar";
import { PaperDetailDrawer } from "./library/PaperDetailDrawer";
import { useI18n } from "@/i18n/I18nProvider";
import { llmLanguageNameFor } from "@/i18n/dict";

const STATUS_META: Record<ReadStatus, { labelKey: string; icon: React.ComponentType<{ className?: string }>; tone: string }> = {
  unread:  { labelKey: "common.unread",  icon: Circle,      tone: "text-litera-mute" },
  reading: { labelKey: "common.reading", icon: CircleDot,   tone: "text-litera-accent2" },
  read:    { labelKey: "common.read",    icon: CircleCheck,  tone: "text-emerald-400" },
  must:    { labelKey: "library.mustRead", icon: Star,        tone: "text-amber-400" },
};

const STATUS_ORDER: ReadStatus[] = ["unread", "reading", "read", "must"];

export function LibraryPage() {
  const [search, setSearch] = useState("");
  const [folderId, setFolderId] = useState<number | null>(null);
  const trimmed = search.trim();
  const { t } = useI18n();

  const { data: rawPapers, isLoading } = useQuery({
    queryKey: ["papers", "list", folderId, trimmed],
    queryFn: () => {
      if (folderId != null) return api.papersInFolder(folderId, 500);
      return trimmed ? api.papersSearch(trimmed, 200) : api.papersRecent(200);
    },
  });
  const papers = folderId == null || !trimmed
    ? rawPapers
    : rawPapers?.filter((paper) => matchesPaper(paper, trimmed));

  const [reading, setReading] = useState<Paper | null>(null);
  const [preview, setPreview] = useState<Paper | null>(null);

  return (
    <section className="h-full flex flex-col">
      <header className="border-b border-litera-line px-6 py-4 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-serif text-2xl tracking-tight">{t("library.title")}</h1>
          <p className="text-sm text-litera-mute">
            {trimmed
              ? t("library.searchResults", { query: trimmed, count: String(papers?.length ?? 0) })
              : papers
              ? t("library.recentPapers", { count: String(papers.length) })
              : t("common.loading")}
          </p>
        </div>
        <div className="relative w-80 max-w-[40vw]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-litera-mute" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("library.searchPlaceholder")}
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
      <div className="flex-1 min-h-0 flex overflow-hidden">
        <FolderSidebar selectedId={folderId} onSelect={setFolderId} />
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <LibrarySkeleton />
          ) : !papers || papers.length === 0 ? (
            trimmed ? <NoResults q={trimmed} /> : <Empty />
          ) : (
            <ul className="divide-y divide-litera-line">
              {papers.map((p) => (
                <PaperRow
                  key={p.id}
                  p={p}
                  onInspect={setPreview}
                  onQuickRead={setReading}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
      {reading && <QuickReadDrawer paper={reading} onClose={() => setReading(null)} />}
      {preview && <PaperDetailDrawer paper={preview} onClose={() => setPreview(null)} />}
    </section>
  );
}

function matchesPaper(paper: Paper, query: string): boolean {
  const needle = query.toLowerCase();
  return (
    paper.title.toLowerCase().includes(needle) ||
    paper.authors.some((author) => author.toLowerCase().includes(needle)) ||
    (paper.abstract_text ?? "").toLowerCase().includes(needle) ||
    (paper.tldr ?? "").toLowerCase().includes(needle)
  );
}

function LibrarySkeleton() {
  return (
    <ul className="divide-y divide-litera-line">
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="px-6 py-3.5">
          <div className="flex items-start gap-3">
            <div className="h-4 w-4 mt-0.5 rounded litera-skeleton shrink-0" />
            <div className="h-4 w-4 mt-0.5 rounded litera-skeleton shrink-0" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-3/4 rounded litera-skeleton" />
              <div className="h-3 w-1/2 rounded litera-skeleton" />
              <div className="h-3 w-2/3 rounded litera-skeleton" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Empty() {
  const t = useI18n().t;
  return (
    <div className="grid place-items-center h-full text-litera-mute litera-fade-in">
      <div className="text-center">
        <LibraryBig className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p className="text-sm">{t("library.empty")}</p>
      </div>
    </div>
  );
}

function NoResults({ q }: { q: string }) {
  const { t } = useI18n();
  return (
    <div className="grid place-items-center h-full text-litera-mute litera-fade-in">
      <div className="text-center">
        <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">{t("library.noResults", { query: q })}</p>
      </div>
    </div>
  );
}

// Memoized so search-box keystrokes (which re-render LibraryPage on every
// character) don't rebuild every visible row's mutations and queries. Each
// row keeps its own react-query state; only papers whose `p` reference
// actually changes will re-render.
const PaperRow = memo(function PaperRow({
  p, onInspect, onQuickRead,
}: {
  p: Paper;
  onInspect: (p: Paper) => void;
  onQuickRead: (p: Paper) => void;
}) {
  const qc = useQueryClient();
  const { t, lang } = useI18n();
  const tldr = useMutation({
    mutationFn: () => api.paperTldr(p.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["papers"] }),
  });
  const translate = useMutation({
    mutationFn: () => api.paperTranslate(p.id, llmLanguageNameFor(lang)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["papers"] });
      qc.invalidateQueries({ queryKey: ["paper", p.id] });
    },
  });
  const attachPdf = useMutation({
    mutationFn: async () => {
      const src = await pickSinglePdf();
      if (!src) return null;
      return api.paperAttachPdf(p.id, src);
    },
    onSuccess: (paper) => {
      if (paper) {
        qc.invalidateQueries({ queryKey: ["papers"] });
        qc.invalidateQueries({ queryKey: ["paper", p.id] });
      }
    },
  });
  const del = useMutation({
    mutationFn: () => api.paperDelete(p.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["papers"] }),
  });
  const tagsQ = useQuery({
    queryKey: ["paper-tags", p.id],
    queryFn: () => api.paperTags(p.id),
  });

  const canOpenPdf = !!p.pdf_path;
  const openMut = useMutation({ mutationFn: () => api.paperOpenPdf(p.id) });
  const [confirming, setConfirming] = useState(false);
  function openPdf() {
    if (!p.pdf_path) return;
    openMut.mutate();
  }

  return (
    <li className="px-6 py-3.5 hover:bg-litera-panel/50 transition-colors group">
      <div className="flex items-start gap-3">
        <StatusToggle paper={p} />
        <FileText className="h-4 w-4 mt-1 text-litera-mute shrink-0" />
        <div className="min-w-0 flex-1">
          <button
            onClick={() => onInspect(p)}
            className="font-medium text-litera-text leading-snug text-left hover:text-litera-accent"
          >
            {p.title}
          </button>
          {p.title_translated && (
            <div className="text-xs text-litera-accent/90 mt-0.5 italic flex items-start gap-1.5">
              <Languages className="h-3 w-3 mt-0.5 shrink-0" />
              <span>{p.title_translated}</span>
            </div>
          )}
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
            {!p.pdf_path && <span className="text-amber-400/80">· {t("library.noPdf")}</span>}
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
              <BookOpen className="h-3 w-3" /> {t("library.hasDeepRead")}
            </div>
          )}
          <TagChipsRow paperId={p.id} tags={tagsQ.data ?? []} />
          <FolderPicker paperId={p.id} />
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1.5 opacity-70 group-hover:opacity-100 transition-opacity">
          {canOpenPdf ? (
            <button
              onClick={openPdf}
              disabled={openMut.isPending}
              className="litera-btn text-xs whitespace-nowrap disabled:opacity-60"
              title={t("library.openPdfTitle")}
            >
              {openMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
              {t("library.openPdf")}
            </button>
          ) : (
            <button
              onClick={() => attachPdf.mutate()}
              disabled={attachPdf.isPending}
              className="litera-btn-primary text-xs whitespace-nowrap disabled:opacity-50"
              title={t("library.attachPdfTitle")}
            >
              {attachPdf.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
              {t("library.attachPdf")}
            </button>
          )}
          <button
            onClick={() => translate.mutate()}
            disabled={translate.isPending}
            className="litera-btn text-xs disabled:opacity-50 whitespace-nowrap"
            title={p.title_translated ? t("library.retranslateTitle") : t("library.translateTitle")}
          >
            {translate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Languages className="h-3.5 w-3.5" />}
            {t("library.translateBtn")}
          </button>
          {canOpenPdf && (
            <Link
              to={`/reader/${p.id}`}
              className="litera-btn text-xs whitespace-nowrap"
              title={t("library.readPdfTitle")}
            >
              <BookOpen className="h-3.5 w-3.5" /> {t("library.readPdf")}
            </Link>
          )}
          <button
            onClick={() => tldr.mutate()}
            disabled={tldr.isPending}
            className="litera-btn text-xs disabled:opacity-50 whitespace-nowrap"
            title={t("library.tldrTitle")}
          >
            {tldr.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {t("library.quickRead")}
          </button>
          <button onClick={() => onQuickRead(p)} className="litera-btn text-xs whitespace-nowrap"
            title={t("library.deepReadTitle")}>
            <BookOpen className="h-3.5 w-3.5" /> {t("library.deepRead")}
          </button>
          <div className="flex items-center gap-1 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {canOpenPdf && (
              <button
                onClick={() => attachPdf.mutate()}
                disabled={attachPdf.isPending}
                className="p-1 rounded text-litera-mute hover:text-litera-text hover:bg-litera-panel disabled:opacity-50"
                title={t("library.attachPdfTitle")}
              >
                {attachPdf.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              </button>
            )}
            {confirming ? (
              <>
                <button
                  onClick={() => { setConfirming(false); del.mutate(); }}
                  disabled={del.isPending}
                  className="px-1.5 py-0.5 rounded text-[10px] bg-red-500/15 text-red-300 hover:bg-red-500/25 disabled:opacity-50 inline-flex items-center gap-1"
                  title={t("library.confirmDelete", { title: p.title, id: p.id })}
                >
                  {del.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  {t("common.delete")}
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  className="px-1.5 py-0.5 rounded text-[10px] text-litera-mute hover:text-litera-text"
                >
                  {t("common.cancel")}
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirming(true)}
                disabled={del.isPending}
                className="p-1 rounded text-litera-mute hover:text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                title={t("library.deleteTitle")}
              >
                {del.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </button>
            )}
          </div>
        </div>
      </div>
      {tldr.error && (
        <div className="ml-7 mt-1 text-xs text-red-400/90">✕ {(tldr.error as Error).message}</div>
      )}
      {translate.error && (
        <div className="ml-7 mt-1 text-xs text-red-400/90">✕ {t("library.translateFailed")}{(translate.error as Error).message}</div>
      )}
      {attachPdf.error && (
        <div className="ml-7 mt-1 text-xs text-red-400/90">✕ {t("library.attachPdfFailed")}{(attachPdf.error as Error).message}</div>
      )}
      {del.error && (
        <div className="ml-7 mt-1 text-xs text-red-400/90">✕ {t("library.deleteFailed")}{(del.error as Error).message}</div>
      )}
      {openMut.error && (
        <div className="ml-7 mt-1 text-xs text-red-400/90">✕ {t("library.openFailed")}{(openMut.error as Error).message}</div>
      )}
    </li>
  );
});

function StatusToggle({ paper }: { paper: Paper }) {
  const qc = useQueryClient();
  const { t } = useI18n();
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
      title={t("library.statusToggle", { status: t(meta.labelKey as Parameters<typeof t>[0]) })}
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
  const { t } = useI18n();
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
  const [confirmingDelete, setConfirmingDelete] = useState(false);

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
    <div className="fixed inset-0 z-30 flex items-stretch justify-end bg-litera-ink/40 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-[640px] max-w-[92vw] h-full bg-litera-paper border-l border-litera-line shadow-2xl flex flex-col">
        <header className="px-5 py-4 border-b border-litera-line flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-litera-accent2 flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5" /> {t("library.deepRead")}
            </div>
            <div className="font-serif text-lg leading-snug mt-0.5">{current.title}</div>
            {current.title_translated && (
              <div className="text-xs text-litera-accent/90 mt-0.5 italic">
                {t("library.translatedPrefix")} {current.title_translated}
              </div>
            )}
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
            {hasCached ? t("library.cachedResult") : m.isPending ? t("library.callingModel") : t("library.generateDeepRead")}
          </div>
          <div className="flex items-center gap-2">
            {confirmingDelete ? (
              <>
                <span className="text-[11px] text-red-400/90">{t("library.confirmDeletePaper")}</span>
                <button
                  onClick={() => { setConfirmingDelete(false); del.mutate(); }}
                  disabled={del.isPending}
                  className="litera-btn text-xs bg-red-500/15 text-red-300 hover:bg-red-500/25 disabled:opacity-50 inline-flex items-center gap-1"
                >
                  {del.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  {t("common.delete")}
                </button>
                <button
                  onClick={() => setConfirmingDelete(false)}
                  className="litera-btn text-xs"
                >
                  {t("common.cancel")}
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirmingDelete(true)}
                disabled={del.isPending}
                className="litera-btn text-xs text-red-400/80 hover:text-red-400 disabled:opacity-50"
                title={t("library.deletePaperTitle")}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
            <button onClick={() => m.mutate()} disabled={m.isPending} className="litera-btn-primary text-xs disabled:opacity-50">
              {m.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {hasCached ? t("library.regenerate") : t("library.runDeepRead")}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4 space-y-5">
          {!result && !m.isPending && (
            <div className="text-sm text-litera-mute text-center py-12">
              <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-40" />
              {t("library.noDeepReadResult", { button: t("library.runDeepRead") })}
              <div className="text-[11px] mt-2">{t("library.needLlmConfig")}</div>
            </div>
          )}
          {m.isPending && !result && (
            <div className="text-sm text-litera-mute flex items-center justify-center gap-2 py-12">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("library.generatingDeepRead")}
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
  const { t } = useI18n();
  return (
    <>
      <Section icon={<Compass className="h-4 w-4" />} label={t("library.resultProblem")} body={r.problem} tone="accent" />
      <Section icon={<Wrench className="h-4 w-4" />}  label={t("library.resultMethod")} body={r.method} tone="accent" />
      <Section icon={<Layers className="h-4 w-4" />}  label={t("library.resultComparison")} body={r.comparison} tone="accent2" />
      <Section icon={<AlertTriangle className="h-4 w-4" />} label={t("library.resultLimitations")} body={r.limitations} tone="warn" />
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
