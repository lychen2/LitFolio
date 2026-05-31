import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Rss } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { api } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";
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
      <header className="border-b border-litera-line px-6 py-4 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl tracking-tight flex items-center gap-2">
            <Rss className="h-5 w-5 text-litera-accent" /> {t("feeds.title")}
          </h1>
          <p className="text-sm text-litera-mute">
            {t("feeds.subtitle")}
          </p>
        </div>
        <RefreshAllButton refresh={refreshAll} />
      </header>

      <div className="flex-1 min-h-0 flex overflow-hidden">
        <FeedListSidebar
          feeds={feedsQ.data ?? []}
          isLoading={feedsQ.isLoading}
          error={feedsQ.error as Error | null}
          selectedId={selectedFeedId}
          onSelect={setSelectedFeedId}
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
