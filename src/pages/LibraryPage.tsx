import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LibraryBig, X, Search, Clock, PenLine,
} from "lucide-react";
import { api, type Paper } from "@/lib/api";
import { FolderSidebar } from "./library/FolderSidebar";
import { PaperDetailDrawer } from "./library/PaperDetailDrawer";
import { ReadingQueue } from "./library/ReadingQueue";
import { QuickReadDrawer } from "./library/QuickReadDrawer";
import { VirtualPaperList } from "./library/PaperList";
import { LitReviewDialog } from "@/components/LitReviewDialog";
import { useI18n } from "@/i18n/I18nProvider";

export function LibraryPage() {
  const [search, setSearch] = useState("");
  const [folderId, setFolderId] = useState<number | null>(null);
  const [smartCollectionId, setSmartCollectionId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"papers" | "queue">("papers");
  const trimmed = search.trim();
  const { t } = useI18n();

  const { data: rawPapers, isLoading } = useQuery({
    queryKey: ["papers", "list", folderId, smartCollectionId, trimmed],
    queryFn: () => {
      if (smartCollectionId != null) return api.smartCollectionQueryPapers(smartCollectionId);
      if (folderId != null) return api.papersInFolder(folderId, 500, trimmed || undefined);
      return trimmed ? api.papersSearch(trimmed, 200) : api.papersRecent(200);
    },
  });
  const papers = smartCollectionId == null || !trimmed
    ? rawPapers
    : rawPapers?.filter((paper) => matchesPaper(paper, trimmed));
  const paperIds = papers?.map((paper) => paper.id) ?? [];
  const tagsQ = useQuery({
    queryKey: ["paper-tags", "batch", paperIds],
    queryFn: () => api.papersBatchTags(paperIds),
    enabled: paperIds.length > 0,
  });
  const tagsByPaper = tagsQ.data ?? {};

  const [reading, setReading] = useState<Paper | null>(null);
  const [preview, setPreview] = useState<Paper | null>(null);
  const [showLitReview, setShowLitReview] = useState(false);

  return (
    <section className="h-full flex flex-col">
      <header className="border-b border-litera-line px-6 py-4 flex items-end justify-between gap-4">
        <div className="min-w-0 flex items-center gap-3">
          <div>
            <h1 className="font-serif text-2xl tracking-tight">
              {viewMode === "queue" ? t("queue.title") : t("library.title")}
            </h1>
            <p className="text-sm text-litera-mute">
              {viewMode === "queue"
                ? ""
                : trimmed
                ? t("library.searchResults", { query: trimmed, count: String(papers?.length ?? 0) })
                : papers
                ? t("library.recentPapers", { count: String(papers.length) })
                : t("common.loading")}
            </p>
          </div>
          <button
            onClick={() => setViewMode(viewMode === "papers" ? "queue" : "papers")}
            className={`litera-btn text-xs ${viewMode === "queue" ? "bg-litera-accent/15 text-litera-accent border-litera-accent/30" : ""}`}
            title={t("queue.title")}
            aria-label={t("queue.title")}
          >
            <Clock className="h-3.5 w-3.5" />
          </button>
          {(folderId != null || smartCollectionId != null) && viewMode === "papers" && papers && papers.length > 0 && (
            <button
              onClick={() => setShowLitReview(true)}
              className="litera-btn text-xs"
              title={t("litReview.title")}
              aria-label={t("litReview.title")}
            >
              <PenLine className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {viewMode === "papers" && (
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
                aria-label={t("common.cancel")}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </header>
      {viewMode === "queue" ? (
        <div className="flex-1 min-h-0 overflow-hidden">
          <ReadingQueue />
        </div>
      ) : (
      <div className="flex-1 min-h-0 flex overflow-hidden">
        <FolderSidebar
          selectedId={folderId}
          onSelect={(id) => { setFolderId(id); setSmartCollectionId(null); }}
          selectedSmartId={smartCollectionId}
          onSelectSmart={setSmartCollectionId}
        />
        <div className="flex-1 overflow-hidden">
          {isLoading ? (
            <div className="overflow-auto h-full"><LibrarySkeleton /></div>
          ) : !papers || papers.length === 0 ? (
            trimmed ? <NoResults q={trimmed} /> : <Empty />
          ) : (
            <VirtualPaperList
              papers={papers}
              tagsByPaper={tagsByPaper}
              onInspect={setPreview}
              onQuickRead={setReading}
            />
          )}
        </div>
      </div>
      )}
      {reading && <QuickReadDrawer paper={reading} onClose={() => setReading(null)} />}
      {preview && <PaperDetailDrawer paper={preview} onClose={() => setPreview(null)} />}
      {showLitReview && papers && (
        <LitReviewDialog
          paperIds={papers.map((p) => p.id)}
          paperCount={papers.length}
          onClose={() => setShowLitReview(false)}
        />
      )}
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
    <ul className="divide-y divide-litera-line litera-stagger">
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
