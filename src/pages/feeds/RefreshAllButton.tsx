import { UseMutationResult } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { type FeedRefreshAllSummary } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";

export function RefreshAllButton({
  refresh,
}: {
  refresh: UseMutationResult<FeedRefreshAllSummary, Error, void>;
}) {
  const t = useT();
  const s = refresh.data;
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={() => refresh.mutate()}
        disabled={refresh.isPending}
        className="litera-btn-primary text-xs flex items-center gap-1.5 disabled:opacity-60"
      >
        {refresh.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" />
        )}
        {t("common.refreshAll")}
      </button>
      {s && (
        <div className="text-[11px] text-litera-mute">
          {t("feeds.refreshSummary", { newItems: s.new_items, unchanged: s.unchanged, failed: s.failed })}
        </div>
      )}
      {refresh.error && (
        <div className="text-[11px] text-red-400/90 max-w-[260px] truncate" title={refresh.error.message}>
          {refresh.error.message}
        </div>
      )}
    </div>
  );
}
