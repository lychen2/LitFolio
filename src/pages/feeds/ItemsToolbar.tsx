import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, Loader2, RefreshCw } from "lucide-react";
import { api, type FeedRefreshResult, type FeedWithCounts } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";

export function ItemsToolbar({
  onlyUnread, onOnlyUnread, selected,
}: {
  onlyUnread: boolean;
  onOnlyUnread: (v: boolean) => void;
  selected: FeedWithCounts | null | undefined;
}) {
  const t = useT();
  const qc = useQueryClient();
  const refresh = useMutation({
    mutationFn: (id: number) => api.feedRefresh(id),
    onSuccess: () => invalidateFeeds(qc),
  });
  const markAll = useMutation({
    mutationFn: (id: number) => api.feedMarkAllSeen(id),
    onSuccess: () => invalidateFeeds(qc),
  });

  return (
    <div className="border-b border-litera-line px-5 py-3 flex items-center gap-3">
      <button onClick={() => onOnlyUnread(!onlyUnread)} className={filterClass(onlyUnread)}>
        {onlyUnread ? t("feeds.onlyUnread") : t("common.all")}
      </button>
      {selected && (
        <>
          <button
            onClick={() => refresh.mutate(selected.id)}
            disabled={refresh.isPending}
            className="text-xs px-2 py-1 rounded border border-litera-line text-litera-text/80 hover:bg-litera-panel flex items-center gap-1.5 disabled:opacity-60"
          >
            {refresh.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            {t("feeds.refreshThis")}
          </button>
          <button
            onClick={() => markAll.mutate(selected.id)}
            disabled={markAll.isPending}
            className="text-xs px-2 py-1 rounded border border-litera-line text-litera-text/80 hover:bg-litera-panel flex items-center gap-1.5 disabled:opacity-60"
          >
            {markAll.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
            {t("feeds.markAllRead")}
          </button>
          <RefreshHint result={refresh.data} />
        </>
      )}
      {selected?.last_error && (
        <span className="ml-auto text-[11px] text-litera-error max-w-[420px] truncate" title={selected.last_error}>
          {t("feeds.lastError")}:{selected.last_error}
        </span>
      )}
    </div>
  );
}

function invalidateFeeds(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["feeds"] });
  qc.invalidateQueries({ queryKey: ["feed-items"] });
}

function filterClass(onlyUnread: boolean) {
  return "text-xs px-2 py-1 rounded border " + (
    onlyUnread
      ? "border-litera-accent/50 bg-litera-accent/15 text-litera-accent"
      : "border-litera-line text-litera-text/80 hover:bg-litera-panel"
  );
}

function RefreshHint({ result }: { result: FeedRefreshResult | undefined }) {
  const t = useT();
  if (!result) return null;
  return (
    <span className="text-[11px] text-litera-mute">
      {result.not_modified ? t("feeds.upToDate") : t("feeds.newItemsCount", { count: result.new_items })}
    </span>
  );
}
