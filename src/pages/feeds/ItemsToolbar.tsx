import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Tooltip from "@radix-ui/react-tooltip";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowDownWideNarrow, Check, ChevronDown, Eye, Spinner, RefreshCw } from "@/components/icons";
import { PageToolbar } from "@/components/PageToolbar";
import { Button, IconButton, Input } from "@/components/ui";
import { api, type FeedRefreshResult, type FeedWithCounts } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";
import type { FeedItemSort } from "@/lib/types/feeds";

const sorts = ["newest", "oldest", "title", "unread", "impact_factor"] as const;

export function ItemsToolbar({
  onlyUnread, onOnlyUnread, filter, onFilter, sort, onSort, selected,
}: {
  onlyUnread: boolean;
  onOnlyUnread: (v: boolean) => void;
  filter: string;
  onFilter: (value: string) => void;
  sort: FeedItemSort;
  onSort: (sort: FeedItemSort) => void;
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
    <PageToolbar>
      {selected && (
        <h2 className="w-full min-w-0 [overflow-wrap:anywhere] text-sm font-semibold text-litera-text" title={selected.url}>
          {selected.title || selected.url}
        </h2>
      )}
      <Input
        type="search"
        className="w-52 max-w-full"
        aria-label={t("feeds.filterTitle")}
        placeholder={t("feeds.filterTitle")}
        value={filter}
        onChange={(event) => onFilter(event.currentTarget.value)}
      />
      <SortMenu sort={sort} onSort={onSort} />
      <Button aria-pressed={onlyUnread} onClick={() => onOnlyUnread(!onlyUnread)}>
        {t("feeds.onlyUnread")}
      </Button>
      {selected && (
        <>
          <Button variant="ghost" onClick={() => refresh.mutate(selected.id)} disabled={refresh.isPending}>
            {refresh.isPending ? <Spinner className="size-5" /> : <RefreshCw className="size-5" />}
            {t("feeds.refreshThis")}
          </Button>
          <Button variant="ghost" onClick={() => markAll.mutate(selected.id)} disabled={markAll.isPending}>
            {markAll.isPending ? <Spinner className="size-5" /> : <Eye className="size-5" />}
            {t("feeds.markAllRead")}
          </Button>
          <RefreshHint result={refresh.data} />
        </>
      )}
      {selected?.last_error && (
        <Tooltip.Provider>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <IconButton label={t("feeds.lastError")} className="ml-auto text-litera-error">
                <AlertTriangle className="size-5" />
              </IconButton>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content sideOffset={4} collisionPadding={8} className="litera-tooltip [overflow-wrap:anywhere]">
                {selected.last_error}
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </Tooltip.Provider>
      )}
    </PageToolbar>
  );
}

function SortMenu({ sort, onSort }: { sort: FeedItemSort; onSort: (sort: FeedItemSort) => void }) {
  const t = useT();

  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <Button className="max-w-full" aria-label={`${t("feeds.sort")} · ${t(`feeds.sort.${sort}`)}`}>
          <ArrowDownWideNarrow className="size-5" />
          <span className="truncate">{t(`feeds.sort.${sort}`)}</span>
          <ChevronDown className="size-4" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={4} collisionPadding={8} className="litera-menu w-56" aria-label={t("feeds.sort")}>
          <DropdownMenu.RadioGroup value={sort}>
            {sorts.map((option) => (
              <DropdownMenu.RadioItem key={option} value={option} className="litera-menu-item" onSelect={() => onSort(option)}>
                {t(`feeds.sort.${option}`)}
                <DropdownMenu.ItemIndicator><Check className="size-5" /></DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function invalidateFeeds(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["feeds"] });
  qc.invalidateQueries({ queryKey: ["feed-items"] });
}

function RefreshHint({ result }: { result: FeedRefreshResult | undefined }) {
  const t = useT();
  if (!result) return null;
  return (
    <span role="status" className="text-xs text-litera-mute">
      {result.not_modified ? t("feeds.upToDate") : t("feeds.newItemsCount", { count: result.new_items })}
    </span>
  );
}
