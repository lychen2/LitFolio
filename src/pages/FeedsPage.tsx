import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PanelLeft, Rss } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { api } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";
import { PageHeader } from "@/components/PageHeader";
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
  const [feedSidebarOpen, setFeedSidebarOpen] = useState(false);
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
    queryKey: ["feed-items", selectedFeedId, onlyUnread],
    queryFn: () =>
      api.feedItemsList({
        feedId: selectedFeedId,
        onlyUnread,
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

  return (
    <section className="h-full flex flex-col">
      <PageHeader
        icon={<Rss className="h-5 w-5 text-litera-accent" aria-hidden="true" />}
        title={t("feeds.title")}
        subtitle={t("feeds.subtitle")}
        actions={(
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setFeedSidebarOpen((open) => !open)} className="litera-btn hidden text-xs max-[900px]:inline-flex" title={t("feeds.sourcesTitle")} aria-label={t("feeds.sourcesTitle")}>
              <PanelLeft className="h-3.5 w-3.5" />
              <span>{t("feeds.sourcesTitle")}</span>
            </button>
            <RefreshAllButton refresh={refreshAll} />
          </div>
        )}
      />

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {feedSidebarOpen && <button type="button" aria-label={t("common.close")} onClick={() => setFeedSidebarOpen(false)} className="absolute inset-0 z-20 hidden bg-litera-ink/45 max-[900px]:block" />}
        <FeedListSidebar
          feeds={feedsQ.data ?? []}
          isLoading={feedsQ.isLoading}
          error={feedsQ.error as Error | null}
          selectedId={selectedFeedId}
          compactOpen={feedSidebarOpen}
          onSelect={(id) => { setSelectedFeedId(id); setFeedSidebarOpen(false); }}
          onClose={() => setFeedSidebarOpen(false)}
        />
        <div className="flex-1 min-w-0 overflow-auto">
          <ItemsToolbar
            onlyUnread={onlyUnread}
            onOnlyUnread={setOnlyUnread}
            selected={selectedFeedId ? feedsQ.data?.find((f) => f.id === selectedFeedId) : null}
          />
          <ItemsList
            items={itemsQ.data ?? []}
            isLoading={itemsQ.isLoading}
            error={itemsQ.error as Error | null}
            feeds={feedsQ.data ?? []}
          />
        </div>
      </div>
    </section>
  );
}
