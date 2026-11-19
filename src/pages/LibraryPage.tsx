import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { Atom, Compass, Inbox, LibraryBig, Rss, Search } from "lucide-react";
import { CoreFrame } from "@/features/reader/CoreFrame";
import type { LibraryFrameCollections } from "@/features/reader/CoreFrame";
import { api } from "@/lib/api";
import { subscribeLibraryChanged } from "@/lib/libraryRefresh";
import { PluginSlot } from "@/host/PluginSlot";
import FixtureButton from "@/plugins/fixture-local/FixtureButton";
import { useI18n } from "@/i18n/I18nProvider";
import { useLibraryHostActions } from "./library/LibraryHostActions";

/** The hosted library owns the list, search and browse controls. */
export function LibraryPage() {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const [folderId, setFolderId] = useState<number | null>(null);
  const [smartId, setSmartId] = useState<number | null>(null);
  const filter = useCanonicalLibraryFilter(folderId, smartId);
  const activeKey = folderId != null ? `folder:${folderId}` : smartId != null ? `smart:${smartId}` : null;
  const choices = useLibraryCollections();
  const { paperIds, pending, failed } = filter;
  const libraryCollections = useMemo(() => ({ choices, activeKey, paperIds, pending, failed }),
    [choices, activeKey, paperIds, pending, failed]);
  const selectCollection = useCallback((key: string | null) => {
    setFolderId(key?.startsWith("folder:") ? Number(key.slice(7)) : null);
    setSmartId(key?.startsWith("smart:") ? Number(key.slice(6)) : null);
  }, []);
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
      <PluginSlot
        slot="library.toolbarActions"
        render={(c) => (c.frontendExport === "renderToolbarButton" ? <FixtureButton /> : null)}
      />
      <div className="min-h-0 flex-1">
        <CoreFrame
          onAction={onAction}
          libraryCollections={libraryCollections}
          onSelectCollection={selectCollection}
          onRetryCollection={filter.retry}
        />
      </div>
      {host.ui}
    </section>
  );
}

interface CanonicalLibraryFilter {
  paperIds: string[] | null;
  pending: boolean;
  /** The membership could not be read, so the empty list is not the real answer. */
  failed: boolean;
  retry: () => void;
}

const EMPTY_MEMBERSHIP: string[] = [];

/**
 * `null` shows every paper. A folder or smart collection narrows the same
 * canonical list through the frame; while that membership loads the filter is
 * the empty set, because showing every paper under a collection heading would
 * misrepresent what the user selected.
 *
 * Membership follows paper writes (folders, tags, read status, delete), so it
 * re-reads on the same signal that reloads the framed list.
 */
function useCanonicalLibraryFilter(
  folderId: number | null,
  smartId: number | null,
): CanonicalLibraryFilter {
  const queryClient = useQueryClient();
  const selected = folderId != null || smartId != null;
  useEffect(() => {
    if (!selected) return;
    return subscribeLibraryChanged(() => {
      void queryClient.invalidateQueries({ queryKey: ["library-filter"] });
    });
  }, [queryClient, selected]);
  const query = useQuery({
    queryKey: ["library-filter", folderId, smartId],
    queryFn: async () => {
      if (smartId != null) {
        return (await api.smartCollectionQueryPapers(smartId)).map((paper) => paper.id);
      }
      if (folderId != null) {
        return (await api.papersInFolder(folderId, Number.MAX_SAFE_INTEGER)).map((paper) => paper.id);
      }
      return [];
    },
    enabled: selected,
    staleTime: 5_000,
  });
  const { refetch } = query;
  const retry = useCallback(() => void refetch(), [refetch]);
  return {
    paperIds: selected ? query.data ?? EMPTY_MEMBERSHIP : null,
    pending: selected && query.isPending,
    failed: selected && query.isError,
    retry,
  };
}

function useLibraryCollections() {
  const { data: folders } = useQuery({ queryKey: ["folders"], queryFn: api.foldersList });
  const { data: smart } = useQuery({ queryKey: ["smart-collections"], queryFn: api.smartCollectionsList });
  return useMemo(() => {
    const choices: LibraryFrameCollections["choices"] = [];
    if (folders) {
      const ids = new Set(folders.map((folder) => folder.id));
      const groups = new Map<number | null, typeof folders>();
      for (const folder of folders) {
        const parent = folder.parent_id != null && ids.has(folder.parent_id) ? folder.parent_id : null;
        const siblings = groups.get(parent);
        if (siblings) siblings.push(folder);
        else groups.set(parent, [folder]);
      }
      function append(parent: number | null, depth: number) {
        for (const folder of groups.get(parent) ?? []) {
          choices.push({ key: `folder:${folder.id}`, title: folder.name, depth });
          append(folder.id, depth + 1);
        }
      }
      append(null, 0);
    }
    for (const collection of smart ?? []) {
      choices.push({ key: `smart:${collection.id}`, title: collection.name });
    }
    return choices;
  }, [folders, smart]);
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
