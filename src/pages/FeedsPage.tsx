import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PanelLeft, Rss } from "@/components/icons";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { listen } from "@tauri-apps/api/event";
import { api } from "@/lib/api";
import type { FeedItemSort } from "@/lib/types/feeds";
import { useT } from "@/i18n/I18nProvider";
import { PageHeader } from "@/components/PageHeader";
import { useNarrowLayout } from "@/hooks/useNarrowLayout";
import { FeedListSidebar } from "./feeds/FeedListSidebar";
import { ItemsList } from "./feeds/FeedItemsList";
import { ItemsToolbar } from "./feeds/ItemsToolbar";
import { RefreshAllButton } from "./feeds/RefreshAllButton";

/// RSS / Atom subscription page. Layout mirrors BrowsePage:
///   left  — feeds list + "+ 订阅" input
///   right — feed entries for the selected feed (or all feeds when no
///           feed is selected). Each entry has a 入库 button that
///           navigates to the existing 导入 page with the arXiv / DOI
///           link pre-filled. The import flow itself stays in
///           ImportPage so the per-paper "must have a PDF" invariant is
///           enforced consistently.
export function FeedsPage() {
  const t = useT();
  const [selectedFeedId, setSelectedFeedId] = useState<number | null>(null);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<FeedItemSort>("newest");
  const keyword = filter.trim();
  const [feedSidebarOpen, setFeedSidebarOpen] = useState(false);
  const isCompact = useNarrowLayout(901);
  useEffect(() => {
    if (!feedSidebarOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && setFeedSidebarOpen(false);
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [feedSidebarOpen]);

  const qc = useQueryClient();
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;
    listen("feed-metadata-backfill-done", () => {
      qc.invalidateQueries({ queryKey: ["feed-items"] });
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [qc]);

  const feedsQ = useQuery({
    queryKey: ["feeds"],
    queryFn: api.feedsList,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });
  const itemsQ = useQuery({
    queryKey: ["feed-items", selectedFeedId, onlyUnread, keyword, sort],
    queryFn: () =>
      api.feedItemsList({
        feedId: selectedFeedId,
        onlyUnread,
        keyword,
        sort,
        limit: 100,
      }),
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });

  const refreshAll = useMutation({
    mutationFn: api.feedRefreshAll,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["feeds"] });
      qc.invalidateQueries({ queryKey: ["feed-items"] });
    },
  });

  const sidebar = (
    <FeedListSidebar
      feeds={feedsQ.data ?? []}
      isLoading={feedsQ.isLoading}
      error={feedsQ.error}
      selectedId={selectedFeedId}
      onSelect={(id) => { setSelectedFeedId(id); setFeedSidebarOpen(false); }}
      onClose={() => setFeedSidebarOpen(false)}
    />
  );
  const articles = (
    <div className="h-full min-w-0 flex-1 overflow-auto">
      <ItemsToolbar
        onlyUnread={onlyUnread}
        onOnlyUnread={setOnlyUnread}
        filter={filter}
        onFilter={setFilter}
        sort={sort}
        onSort={setSort}
        selected={feedsQ.data?.find((feed) => feed.id === selectedFeedId)}
      />
      <ItemsList
        items={itemsQ.data ?? []}
        isLoading={itemsQ.isLoading}
        error={itemsQ.error}
        feeds={feedsQ.data ?? []}
        filtered={onlyUnread || keyword.length > 0}
      />
    </div>
  );

  return (
    <section className="h-full flex flex-col">
      <PageHeader
        icon={<Rss />}
        title={t("feeds.title")}
        subtitle={t("feeds.subtitle")}
        actions={(
          <>
            <button type="button" onClick={() => setFeedSidebarOpen((open) => !open)} className="litera-btn hidden text-xs max-[900px]:inline-flex" title={t("feeds.sourcesTitle")} aria-label={t("feeds.sourcesTitle")}>
              <PanelLeft className="h-3.5 w-3.5" />
              <span>{t("feeds.sourcesTitle")}</span>
            </button>
            <RefreshAllButton refresh={refreshAll} />
          </>
        )}
      />

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {isCompact ? (
          <>
            {feedSidebarOpen && (
              <>
                <button type="button" aria-label={t("common.close")} onClick={() => setFeedSidebarOpen(false)} className="absolute inset-0 z-20 bg-litera-ink/45" />
                <div className="absolute inset-y-0 left-0 z-30 w-[270px] max-w-full border-r border-litera-border bg-litera-paper shadow-2xl">
                  {sidebar}
                </div>
              </>
            )}
            {articles}
          </>
        ) : (
          <PanelGroup direction="horizontal">
            <Panel id="feed-sources" defaultSize={25} minSize={17} maxSize={52}>
              {sidebar}
            </Panel>
            <PanelResizeHandle className="reader-resize-handle" aria-label={t("feeds.resizeSources")}>
              <span className="reader-resize-grip" aria-hidden="true" />
            </PanelResizeHandle>
            <Panel id="feed-articles" defaultSize={75} minSize={48}>
              {articles}
            </Panel>
          </PanelGroup>
        )}
      </div>
    </section>
  );
}
