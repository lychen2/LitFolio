import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Atom, Compass, Download, Inbox, LibraryBig, ListPlus, Loader2,
  Rss, X, Search, PenLine,
} from "lucide-react";
import { api, type Paper } from "@/lib/api";
import { zoteroErrorMessage } from "@/lib/zoteroError";
import { FolderSidebar } from "./library/FolderSidebar";
import { PaperDetailDrawer } from "./library/PaperDetailDrawer";
import { ReadingQueue } from "./library/ReadingQueue";
import { QuickReadDrawer } from "./library/QuickReadDrawer";
import { VirtualPaperList } from "./library/PaperList";
import { LibraryFilterBar, type LibraryViewMode } from "./library/LibraryFilterBar";
import { PluginSlot } from "@/host/PluginSlot";
import FixtureButton from "@/plugins/fixture-local/FixtureButton";
import { filterLibraryPapers, type LibraryFilterState } from "./library/libraryFilters";
import { toggleLibrarySelection } from "./library/librarySelection";
import { LitReviewDialog } from "@/components/LitReviewDialog";
import { ExportCitationsDialog } from "@/components/ExportCitationsDialog";
import { useI18n } from "@/i18n/I18nProvider";

export function LibraryPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [folderId, setFolderId] = useState<number | null>(null);
  const [smartCollectionId, setSmartCollectionId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<LibraryViewMode>("papers");
  const [folderOpen, setFolderOpen] = useState(false);
  useEffect(() => {
    if (!folderOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && setFolderOpen(false);
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [folderOpen]);
  const [filters, setFilters] = useState<LibraryFilterState>({ year: "", readStatus: "", tagId: "" });
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
  const tagOptions = Array.from(
    new Map(Object.values(tagsByPaper).flat().map((tag) => [tag.id, tag])).values(),
  ).sort((a, b) => a.name.localeCompare(b.name));
  const filteredPapers = papers ? filterLibraryPapers(papers, tagsByPaper, filters) : papers;
  const resultLabel = viewMode === "queue"
    ? ""
    : trimmed
    ? t("library.searchResults", { query: trimmed, count: String(filteredPapers?.length ?? 0) })
    : filteredPapers
    ? t("library.recentPapers", { count: String(filteredPapers.length) })
    : t("common.loading");
  const canReviewCollection =
    (folderId != null || smartCollectionId != null) &&
    viewMode === "papers" &&
    !!filteredPapers &&
    filteredPapers.length > 0;
  const [reading, setReading] = useState<Paper | null>(null);
  const [preview, setPreview] = useState<Paper | null>(null);
  const [showLitReview, setShowLitReview] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const selected = Array.from(selectedIds);
  const queueSelected = useMutation({
    mutationFn: async () => {
      await Promise.all(selected.map((id) => api.queueAdd(id)));
    },
    onSuccess: () => {
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["queue"] });
    },
  });
  const zoteroPush = useMutation({
    mutationFn: ({ ids, force }: { ids: string[]; force: boolean }) => api.zoteroPush(ids, force),
    onSuccess: (result, variables) => {
      if (result.skipped.length > 0 && !variables.force) {
        if (window.confirm(t("library.zoteroRepushConfirm", { count: String(result.skipped.length) }))) {
          zoteroPush.mutate({ ids: result.skipped, force: true });
        }
        return;
      }
      setSelectedIds(new Set());
    },
  });
  const pushToZotero = () => zoteroPush.mutate({ ids: selected, force: false });
  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => toggleLibrarySelection(prev, id));
  };

  return (
    <section className="h-full flex flex-col">
      <LibraryFilterBar
        viewMode={viewMode}
        search={search}
        resultLabel={resultLabel}
        canReviewCollection={canReviewCollection}
        onSearchChange={setSearch}
        onClearSearch={() => setSearch("")}
        filters={filters}
        tagOptions={tagOptions}
        onFiltersChange={setFilters}
        onToggleViewMode={() => setViewMode(viewMode === "papers" ? "queue" : "papers")}
        onToggleFolders={() => setFolderOpen((open) => !open)}
        onReviewCollection={() => setShowLitReview(true)}
      />
      <PluginSlot
        slot="library.toolbarActions"
        render={(c) => (c.frontendExport === "renderToolbarButton" ? <FixtureButton /> : null)}
      />
      {viewMode === "queue" ? (
        <div className="flex-1 min-h-0 overflow-hidden">
          <ReadingQueue />
        </div>
      ) : (
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {folderOpen && <button type="button" aria-label={t("common.close")} onClick={() => setFolderOpen(false)} className="absolute inset-0 z-20 hidden bg-litera-ink/45 max-[900px]:block" />}
        <FolderSidebar
          selectedId={folderId}
          compactOpen={folderOpen}
          onSelect={(id) => { setFolderId(id); setSmartCollectionId(null); setFolderOpen(false); }}
          selectedSmartId={smartCollectionId}
          onSelectSmart={(id) => { setSmartCollectionId(id); setFolderOpen(false); }}
          onClose={() => setFolderOpen(false)}
        />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {selected.length > 0 && (
            <SelectionToolbar
              count={selected.length}
              queueing={queueSelected.isPending}
              onClear={() => setSelectedIds(new Set())}
              onQueue={() => queueSelected.mutate()}
              onLitReview={() => setShowLitReview(true)}
              onExport={() => setShowExport(true)}
              onZotero={pushToZotero}
              zoteroBusy={zoteroPush.isPending}
            />
          )}
          {zoteroPush.error && (
            <div className="shrink-0 border-b border-litera-error/20 bg-litera-error/10 px-5 py-2 text-xs text-litera-error">
              {zoteroErrorMessage(zoteroPush.error, t)}
            </div>
          )}
          {zoteroPush.isSuccess && (
            <div className="shrink-0 border-b border-litera-success/20 bg-litera-success/10 px-5 py-2 text-xs text-litera-success">
              {t("library.zoteroPushed", { count: String(zoteroPush.data.pushed) })}
              {zoteroPush.data.skipped.length > 0 &&
                " · " + t("library.zoteroSkipped", { count: String(zoteroPush.data.skipped.length) })}
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-hidden">
            {isLoading ? (
              <div className="h-full overflow-auto"><LibrarySkeleton /></div>
            ) : !filteredPapers || filteredPapers.length === 0 ? (
              trimmed ? <NoResults q={trimmed} /> : <LibraryEmptyState />
            ) : (
              <VirtualPaperList
                papers={filteredPapers}
                tagsByPaper={tagsByPaper}
                selectedIds={selectedIds}
                onToggleSelection={toggleSelection}
                onInspect={setPreview}
                onQuickRead={setReading}
              />
            )}
          </div>
        </div>
      </div>
      )}
      {reading && <QuickReadDrawer paper={reading} onClose={() => setReading(null)} />}
      {preview && <PaperDetailDrawer paper={preview} onClose={() => setPreview(null)} />}
      {showLitReview && filteredPapers && (
        <LitReviewDialog
          paperIds={selected.length > 0 ? selected : filteredPapers.map((p) => p.id)}
          paperCount={selected.length > 0 ? selected.length : filteredPapers.length}
          onClose={() => setShowLitReview(false)}
        />
      )}
      {showExport && (
        <ExportCitationsDialog
          paperIds={selected}
          onClose={() => setShowExport(false)}
        />
      )}
    </section>
  );
}

function SelectionToolbar({
  count, queueing, onClear, onQueue, onLitReview, onExport, onZotero, zoteroBusy,
}: {
  count: number;
  queueing: boolean;
  onClear: () => void;
  onQueue: () => void;
  onLitReview: () => void;
  onExport: () => void;
  onZotero: () => void;
  zoteroBusy: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-litera-border bg-litera-paper/95 px-4 py-2 text-xs shadow-sm">
      <span className="mr-auto text-litera-mute">{t("library.selectedCount", { count: String(count) })}</span>
      <button onClick={onQueue} disabled={queueing} className="litera-btn text-xs disabled:opacity-50">
        {queueing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ListPlus className="h-3.5 w-3.5" />}
        {t("queue.add")}
      </button>
      <button onClick={onLitReview} className="litera-btn text-xs">
        <PenLine className="h-3.5 w-3.5" />
        {t("litReview.title")}
      </button>
      <button onClick={onExport} className="litera-btn text-xs">
        <Download className="h-3.5 w-3.5" />
        {t("citations.title")}
      </button>
      <button onClick={onZotero} disabled={zoteroBusy} className="litera-btn text-xs disabled:opacity-50">
        {zoteroBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LibraryBig className="h-3.5 w-3.5" />}
        {t("library.sendToZoteroBatch")}
      </button>
      <button onClick={onClear} className="litera-icon-btn h-7 w-7" title={t("common.cancel")} aria-label={t("common.cancel")}>
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
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

export function libraryEmptyActions(t: (key: Parameters<ReturnType<typeof useI18n>["t"]>[0]) => string) {
  return [
    { to: "/import?tab=pdf", icon: Inbox, label: t("library.emptyImportPdf") },
    { to: "/import?tab=arxiv_doi", icon: Atom, label: t("library.emptyAddIdentifier") },
    { to: "/topic", icon: Compass, label: t("library.emptyStartTopic") },
    { to: "/feeds", icon: Rss, label: t("library.emptyTrackFeeds") },
  ];
}

export function LibraryEmptyState() {
  const t = useI18n().t;
  const actions = libraryEmptyActions(t);
  return (
    <div className="h-full overflow-auto px-6 py-10 litera-fade-in">
      <div className="mx-auto max-w-xl">
        <LibraryBig className="h-10 w-10 mb-4 text-litera-mute" />
        <h2 className="font-serif text-xl tracking-tight text-litera-text">{t("library.emptyTitle")}</h2>
        <p className="mt-1 text-sm text-litera-mute">{t("library.empty")}</p>
        <div className="mt-6 divide-y divide-litera-line border-y border-litera-line">
          {actions.map(({ to, icon: Icon, label }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-3 py-3 text-sm text-litera-text hover:text-litera-accent transition-colors"
            >
              <Icon className="h-4 w-4 text-litera-mute" />
              <span>{label}</span>
            </Link>
          ))}
        </div>
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
