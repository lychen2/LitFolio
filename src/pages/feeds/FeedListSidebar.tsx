import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Plus, Rss, Spinner, Trash2, X } from "@/components/icons";
import { api, type FeedWithCounts } from "@/lib/api";
import { useI18n, useT } from "@/i18n/I18nProvider";
import "./feedUnreadMeter.css";

export function FeedListSidebar({
  feeds, isLoading, error, selectedId, onSelect, onClose,
}: {
  feeds: FeedWithCounts[];
  isLoading: boolean;
  error: Error | null;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  onClose: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [url, setUrl] = useState("");
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const add = useMutation({
    mutationFn: (u: string) => api.feedAdd(u),
    onSuccess: (f) => {
      setUrl("");
      onSelect(f.id);
      invalidateFeeds(qc);
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.feedRemove(id),
    onSuccess: (_, id) => {
      if (selectedId === id) onSelect(null);
      invalidateFeeds(qc);
    },
  });

  const totals = feeds.reduce(
    (sum, feed) => ({
      total: sum.total + feed.total_items,
      unread: sum.unread + feed.unread_items,
    }),
    { total: 0, unread: 0 },
  );

  function submit() {
    const trimmedUrl = url.trim();
    if (trimmedUrl) add.mutate(trimmedUrl);
  }

  return (
    <aside className="flex h-full min-w-0 flex-col overflow-auto bg-litera-paper/35">
      <div className="hidden items-center justify-between border-b border-litera-border px-3 py-2 max-[900px]:flex">
        <span className="litera-section-label">{t("feeds.sourcesTitle")}</span>
        <button type="button" onClick={onClose} className="litera-icon-btn h-7 w-7" aria-label={t("common.close")} title={t("common.close")}><X className="h-3.5 w-3.5" /></button>
      </div>
      <SubscribeBox url={url} setUrl={setUrl} addPending={add.isPending} addError={add.error as Error | null} onSubmit={submit} />
      <nav className="p-2 flex-1 litera-feed-sources">
        <FeedItemBtn
          active={selectedId == null}
          label={t("feeds.allSubs")}
          counts={isLoading || error ? undefined : totals}
          onClick={() => onSelect(null)}
        />
        <FeedNavBody
          feeds={feeds}
          isLoading={isLoading}
          error={error}
          selectedId={selectedId}
          confirmingId={confirmingId}
          removePending={remove.isPending}
          onSelect={onSelect}
          setConfirmingId={setConfirmingId}
          onRemove={(id) => remove.mutate(id)}
        />
      </nav>
    </aside>
  );
}

function invalidateFeeds(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["feeds"] });
  qc.invalidateQueries({ queryKey: ["feed-items"] });
}

function SubscribeBox({
  url, setUrl, addPending, addError, onSubmit,
}: {
  url: string;
  setUrl: (url: string) => void;
  addPending: boolean;
  addError: Error | null;
  onSubmit: () => void;
}) {
  const t = useT();
  return (
    <div className="border-b border-litera-border px-3 py-3">
      <div className="litera-section-label mb-2">{t("feeds.sourcesTitle")}</div>
      <div className="flex gap-1">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSubmit()}
          placeholder={t("feeds.placeholder")}
          className="litera-input flex-1 min-w-0 py-1 text-[11px]"
        />
        <button
          onClick={onSubmit}
          disabled={addPending || !url.trim()}
          className="litera-btn-primary text-[11px] px-2 py-1 disabled:opacity-50 shrink-0 flex items-center"
          title={t("feeds.subscribe")}
        >
          {addPending ? <Spinner className="size-4" /> : <Plus className="size-4" />}
        </button>
      </div>
      {addError && <div className="mt-1 text-[10px] text-litera-error break-words">{addError.message}</div>}
    </div>
  );
}

function FeedNavBody({
  feeds, isLoading, error, selectedId, confirmingId, removePending, onSelect, setConfirmingId, onRemove,
}: {
  feeds: FeedWithCounts[];
  isLoading: boolean;
  error: Error | null;
  selectedId: number | null;
  confirmingId: number | null;
  removePending: boolean;
  onSelect: (id: number | null) => void;
  setConfirmingId: (id: number | null) => void;
  onRemove: (id: number) => void;
}) {
  const t = useT();
  if (error) return <FeedError message={error.message} />;
  if (isLoading) return <FeedLoading />;
  if (feeds.length === 0) return <EmptyFeeds />;
  // Keep the 35 ms rhythm on short lists and start the last row within 420 ms.
  const stepMs = Math.min(35, 420 / feeds.length);
  return feeds.map((f, index) => (
    <div key={f.id} className="group flex items-center gap-1" style={{ animationDelay: `${(index + 1) * stepMs}ms` }}>
      <FeedItemBtn
        active={selectedId === f.id}
        label={f.title || f.url}
        counts={{ unread: f.unread_items, total: f.total_items }}
        error={f.last_error}
        onClick={() => onSelect(f.id)}
      />
      {confirmingId === f.id ? (
        <RemoveConfirm
          name={f.title || f.url}
          pending={removePending}
          onConfirm={() => { setConfirmingId(null); onRemove(f.id); }}
          onCancel={() => setConfirmingId(null)}
        />
      ) : (
        <button
          onClick={() => setConfirmingId(f.id)}
          disabled={removePending}
          className="litera-icon-btn h-7 w-7 text-litera-mute opacity-70 hover:text-litera-error group-hover:opacity-100"
          title={t("feeds.unsubscribe")}
        >
          <Trash2 className="size-[1.125rem]" />
        </button>
      )}
    </div>
  ));
}

function FeedError({ message }: { message: string }) {
  const t = useT();
  return (
    <div className="mt-3 px-2 py-3 rounded border border-litera-error/40 bg-litera-error/10 text-[11px] text-litera-error">
      {t("feeds.loadFailedColon", { message })}
    </div>
  );
}

function FeedLoading() {
  const t = useT();
  return (
    <div className="px-2 py-3 text-[11px] text-litera-mute flex items-center gap-1.5">
      <Spinner className="h-3 w-3 animate-spin" /> {t("common.loading")}
    </div>
  );
}

function EmptyFeeds() {
  const t = useT();
  return (
    <div className="mt-3 px-2 py-3 rounded border border-dashed border-litera-line/70 text-[11px] text-litera-mute leading-relaxed">
      <div className="text-litera-text/80 mb-1">{t("feeds.noSubs")}</div>
      <div>{t("feeds.emptyHintBody")}</div>
      <div className="font-mono mt-1 text-[10px] break-all text-litera-text/60">
        http://arxiv.org/rss/physics.optics
      </div>
    </div>
  );
}

function RemoveConfirm({
  name, pending, onConfirm, onCancel,
}: {
  name: string;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  return (
    <>
      <button
        onClick={onConfirm}
        disabled={pending}
        className="px-1.5 py-0.5 rounded text-[10px] bg-litera-error/15 text-litera-error hover:bg-litera-error/25 disabled:opacity-50 inline-flex items-center gap-1"
        title={t("feeds.removeConfirm", { name })}
      >
        {pending ? <Spinner className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
        {t("common.delete")}
      </button>
      <button onClick={onCancel} className="px-1.5 py-0.5 rounded text-[10px] text-litera-mute hover:text-litera-text">
        {t("common.cancel")}
      </button>
    </>
  );
}

function FeedItemBtn({
  active, label, counts, error, onClick,
}: {
  active: boolean;
  label: string;
  counts?: { unread: number; total: number };
  error?: string | null;
  onClick: () => void;
}) {
  const { t, lang } = useI18n();
  const { unread, total } = counts ?? { unread: 0, total: 0 };
  const unreadLabel = lang === "zh" ? `未读 ${unread} 条，共 ${total} 条` : `${unread} unread of ${total} articles`;
  return (
    <button
      type="button"
      onClick={onClick}
      title={[label, counts && unreadLabel, error && t("feeds.loadFailedColon", { message: error })].filter(Boolean).join("\n")}
      aria-current={active ? "true" : undefined}
      className={
        "feed-source-button flex w-full min-w-0 flex-1 items-center gap-2 px-2 py-2 rounded text-xs text-left " +
        (active ? "bg-litera-accent/12 text-litera-accent" : "text-litera-mute hover:bg-litera-surface2 hover:text-litera-text")
      }
    >
      {error ? <AlertTriangle className="size-[1.125rem] shrink-0" /> : <Rss className="size-[1.125rem] shrink-0" />}
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate">{label}</span>
          {counts && (
            <span className="relative shrink-0 font-mono text-[11px] tabular-nums">
              <span className="sr-only">{unreadLabel}</span>
              <span aria-hidden="true"><strong>{unread}</strong>/{total}</span>
            </span>
          )}
        </span>
        {total > 0 && (
          <span className="feed-unread-track" aria-hidden="true">
            <span className="feed-unread-fill" style={{ width: `${(unread / total) * 100}%` }} />
          </span>
        )}
      </span>
    </button>
  );
}
