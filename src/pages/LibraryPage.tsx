import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { Atom, Compass, Inbox, LibraryBig, Rss, Search, X } from "lucide-react";
import { EasyReadFrame } from "@/features/reader/EasyReadFrame";
import { api } from "@/lib/api";
import { PluginSlot } from "@/host/PluginSlot";
import FixtureButton from "@/plugins/fixture-local/FixtureButton";
import { useI18n } from "@/i18n/I18nProvider";
import { useLibraryHostActions } from "./library/LibraryHostActions";

/**
 * Library route. The upstream EasyRead library page is the only list: it owns
 * browsing, search, reading and import. LitFolio's own capabilities reach that
 * list as host actions (see `LibraryHostActions`), so each paper keeps one
 * identity instead of a second LitFolio copy beside the upstream row.
 *
 * Host chrome can trigger any surface with
 * `host.onAction({ type: "action", action: "collections", paperIds: [] })`;
 * the reader page reuses the same controller for its single-paper actions.
 */
export function LibraryPage() {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const [folderId, setFolderId] = useState<number | null>(null);
  const [smartId, setSmartId] = useState<number | null>(null);
  const filterPaperIds = useCanonicalLibraryFilter(folderId, smartId);
  const activeName = useActiveCollectionName(folderId, smartId);
  const host = useLibraryHostActions({
    collections: {
      folderId,
      smartId,
      onSelectFolder: setFolderId,
      onSelectSmart: setSmartId,
    },
  });

  /**
   * `?panel=collections` and `?panel=queue-open` let another route (the
   * reader) hand off a surface that host does not render itself.
   */
  const panel = searchParams.get("panel");
  const { onAction } = host;
  useEffect(() => {
    if (panel !== "collections" && panel !== "queue-open") return;
    onAction({ type: "action", action: panel, paperIds: [] });
    setSearchParams(
      (next) => {
        next.delete("panel");
        return next;
      },
      { replace: true },
    );
  }, [onAction, panel, setSearchParams]);

  return (
    <section className="flex h-full flex-col" aria-label={t("nav.library")}>
      <h1 className="sr-only">{t("nav.library")}</h1>
      <div className="flex shrink-0 items-center gap-2 border-b border-litera-border px-4 py-1.5">
        <HostActionButton
          label={t("folders.title")}
          onClick={() => host.onAction({ type: "action", action: "collections", paperIds: [] })}
        />
        <HostActionButton
          label={t("queue.title")}
          onClick={() => host.onAction({ type: "action", action: "queue-open", paperIds: [] })}
        />
        <PluginSlot
          slot="library.toolbarActions"
          render={(c) => (c.frontendExport === "renderToolbarButton" ? <FixtureButton /> : null)}
        />
        {activeName && (
          <div className="ml-auto flex min-w-0 items-center gap-2 text-xs text-litera-mute">
            <span className="truncate text-litera-text">{activeName}</span>
            <button
              type="button"
              onClick={() => {
                setFolderId(null);
                setSmartId(null);
              }}
              className="litera-btn text-[11px]"
            >
              <X className="h-3 w-3" />
              {t("folders.all")}
            </button>
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1">
        <EasyReadFrame filterPaperIds={filterPaperIds} onAction={host.onAction} />
      </div>
      {host.ui}
    </section>
  );
}

function HostActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="litera-btn text-xs">
      {label}
    </button>
  );
}

/**
 * `null` shows every paper. A folder or smart collection narrows the same
 * canonical list through the frame; while that membership loads the filter is
 * the empty set, because showing every paper under a collection heading would
 * misrepresent what the user selected.
 */
function useCanonicalLibraryFilter(
  folderId: number | null,
  smartId: number | null,
): string[] | null {
  const selected = folderId != null || smartId != null;
  const query = useQuery({
    queryKey: ["library-filter", folderId, smartId],
    queryFn: async () => {
      if (smartId != null) {
        return (await api.smartCollectionQueryPapers(smartId)).map((paper) => paper.id);
      }
      if (folderId != null) {
        return (await api.papersInFolder(folderId, 500)).map((paper) => paper.id);
      }
      return [];
    },
    enabled: selected,
    staleTime: 5_000,
  });
  if (!selected) return null;
  return query.data ?? [];
}

/** Name of the active folder or smart collection, for the filter chip. */
function useActiveCollectionName(folderId: number | null, smartId: number | null): string | null {
  const active = folderId != null || smartId != null;
  const folders = useQuery({
    queryKey: ["folders"],
    queryFn: api.foldersList,
    enabled: active && folderId != null,
    staleTime: 30_000,
  });
  const smart = useQuery({
    queryKey: ["smart-collections"],
    queryFn: api.smartCollectionsList,
    enabled: active && smartId != null,
    staleTime: 30_000,
  });
  if (folderId != null) return folders.data?.find((folder) => folder.id === folderId)?.name ?? null;
  if (smartId != null) return smart.data?.find((collection) => collection.id === smartId)?.name ?? null;
  return null;
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

export function NoResults({ q }: { q: string }) {
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
