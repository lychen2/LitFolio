import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Radio, Trash2 } from "lucide-react";
import { api, type FeedWithCounts } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";

export function FeedListSidebar({
  feeds, isLoading, error, selectedId, onSelect,
}: {
  feeds: FeedWithCounts[];
  isLoading: boolean;
  error: Error | null;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
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

  function submit() {
    const trimmedUrl = url.trim();
    if (trimmedUrl) add.mutate(trimmedUrl);
  }

  return (
    <aside className="w-[260px] shrink-0 border-r border-litera-line bg-litera-paper/40 overflow-auto flex flex-col">
      <SubscribeBox url={url} setUrl={setUrl} addPending={add.isPending} addError={add.error as Error | null} onSubmit={submit} />
      <nav className="p-2 flex-1 litera-stagger">
        <FeedItemBtn
          active={selectedId == null}
          label={t("feeds.allSubs")}
          unread={feeds.reduce((s, f) => s + f.unread_items, 0)}
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
    <div className="px-3 py-3 border-b border-litera-line">
      <div className="text-xs uppercase tracking-wider text-litera-mute mb-2">{t("feeds.sourcesTitle")}</div>
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
          {addPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
        </button>
      </div>
      {addError && <div className="mt-1 text-[10px] text-red-400/90 break-words">{addError.message}</div>}
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
  return feeds.map((f) => (
    <div key={f.id} className="group flex items-center gap-1">
      <FeedItemBtn
        active={selectedId === f.id}
        label={f.title || f.url}
        unread={f.unread_items}
        error={!!f.last_error}
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
          className="p-1 text-litera-mute hover:text-red-400 opacity-0 group-hover:opacity-100"
          title={t("feeds.unsubscribe")}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  ));
}

function FeedError({ message }: { message: string }) {
  const t = useT();
  return (
    <div className="mt-3 px-2 py-3 rounded border border-red-400/40 bg-red-500/10 text-[11px] text-red-300">
      {t("feeds.loadFailedColon", { message })}
    </div>
  );
}

function FeedLoading() {
  const t = useT();
  return (
    <div className="px-2 py-3 text-[11px] text-litera-mute flex items-center gap-1.5">
      <Loader2 className="h-3 w-3 animate-spin" /> {t("common.loading")}
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
        className="px-1.5 py-0.5 rounded text-[10px] bg-red-500/15 text-red-300 hover:bg-red-500/25 disabled:opacity-50 inline-flex items-center gap-1"
        title={t("feeds.removeConfirm", { name })}
      >
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
        {t("common.delete")}
      </button>
      <button onClick={onCancel} className="px-1.5 py-0.5 rounded text-[10px] text-litera-mute hover:text-litera-text">
        {t("common.cancel")}
      </button>
    </>
  );
}

function FeedItemBtn({
  active, label, unread, error, onClick,
}: {
  active: boolean;
  label: string;
  unread: number;
  error?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "flex-1 min-w-0 flex items-center gap-1.5 px-2 py-1.5 rounded text-xs text-left " +
        (active ? "bg-litera-accent/15 text-litera-accent" : "text-litera-text/75 hover:bg-litera-panel")
      }
    >
      <Radio className={"h-3 w-3 shrink-0 " + (error ? "text-red-400" : "")} />
      <span className="truncate">{label}</span>
      {unread > 0 && (
        <span className="ml-auto text-[10px] px-1.5 rounded-full bg-litera-accent/20 text-litera-accent">
          {unread}
        </span>
      )}
    </button>
  );
}
