import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ExternalLink, Eye, EyeOff, Inbox, Languages, Loader2, Plus, Radio, RefreshCw,
  Rss, Trash2, X,
} from "lucide-react";
import { open as openInBrowser } from "@tauri-apps/plugin-shell";
import {
  api,
  type ArxivDraft,
  type FeedItem,
  type FeedRefreshAllSummary,
  type FeedRefreshResult,
  type FeedWithCounts,
  type TranslationResult,
} from "@/lib/api";
import { useI18n, useT } from "@/i18n/I18nProvider";
import { llmLanguageNameFor } from "@/i18n/dict";

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
  const feedsQ = useQuery({
    queryKey: ["feeds"],
    queryFn: api.feedsList,
    refetchInterval: 30000,
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

function RefreshAllButton({
  refresh,
}: {
  refresh: ReturnType<typeof useMutation<FeedRefreshAllSummary, Error, void>>;
}) {
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
        刷新全部
      </button>
      {s && (
        <div className="text-[11px] text-litera-mute">
          {s.new_items} 篇新文 · {s.unchanged} 已是最新 · {s.failed} 失败
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

function FeedListSidebar({
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
  const add = useMutation({
    mutationFn: (u: string) => api.feedAdd(u),
    onSuccess: (f) => {
      setUrl("");
      onSelect(f.id);
      qc.invalidateQueries({ queryKey: ["feeds"] });
      qc.invalidateQueries({ queryKey: ["feed-items"] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.feedRemove(id),
    onSuccess: (_, id) => {
      if (selectedId === id) onSelect(null);
      qc.invalidateQueries({ queryKey: ["feeds"] });
      qc.invalidateQueries({ queryKey: ["feed-items"] });
    },
  });

  function submit() {
    const t = url.trim();
    if (!t) return;
    add.mutate(t);
  }

  return (
    <aside className="w-[260px] shrink-0 border-r border-litera-line bg-litera-paper/40 overflow-auto flex flex-col">
      <div className="px-3 py-3 border-b border-litera-line">
        <div className="text-xs uppercase tracking-wider text-litera-mute mb-2">{t("feeds.sourcesTitle")}</div>
        <div className="flex gap-1">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder={t("feeds.placeholder")}
            className="litera-input flex-1 min-w-0 py-1 text-[11px]"
          />
          <button
            onClick={submit}
            disabled={add.isPending || !url.trim()}
            className="litera-btn-primary text-[11px] px-2 py-1 disabled:opacity-50 shrink-0 flex items-center"
            title={t("feeds.subscribe")}
          >
            {add.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          </button>
        </div>
        {add.error && (
          <div className="mt-1 text-[10px] text-red-400/90 break-words">{(add.error as Error).message}</div>
        )}
      </div>
      <nav className="p-2 flex-1">
        <FeedItemBtn
          active={selectedId == null}
          label={t("feeds.allSubs")}
          unread={feeds.reduce((s, f) => s + f.unread_items, 0)}
          onClick={() => onSelect(null)}
        />
        {error ? (
          <div className="mt-3 px-2 py-3 rounded border border-red-400/40 bg-red-500/10 text-[11px] text-red-300">
            加载失败:{error.message}
          </div>
        ) : isLoading ? (
          <div className="px-2 py-3 text-[11px] text-litera-mute flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" /> 加载中…
          </div>
        ) : feeds.length === 0 ? (
          <div className="mt-3 px-2 py-3 rounded border border-dashed border-litera-line/70 text-[11px] text-litera-mute leading-relaxed">
            <div className="text-litera-text/80 mb-1">还没有订阅。</div>
            <div>把 RSS / Atom 链接粘贴到上面 + 按钮即可。例如:</div>
            <div className="font-mono mt-1 text-[10px] break-all text-litera-text/60">
              http://arxiv.org/rss/physics.optics
            </div>
          </div>
        ) : (
          feeds.map((f) => (
            <div key={f.id} className="group flex items-center gap-1">
              <FeedItemBtn
                active={selectedId === f.id}
                label={f.title || f.url}
                unread={f.unread_items}
                error={!!f.last_error}
                onClick={() => onSelect(f.id)}
              />
              <button
                onClick={() => {
                  if (confirm(`移除订阅「${f.title || f.url}」?`)) remove.mutate(f.id);
                }}
                disabled={remove.isPending}
                className="p-1 text-litera-mute hover:text-red-400 opacity-0 group-hover:opacity-100"
                title="取消订阅"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))
        )}
      </nav>
    </aside>
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

function ItemsToolbar({
  onlyUnread, onOnlyUnread, selected,
}: {
  onlyUnread: boolean;
  onOnlyUnread: (v: boolean) => void;
  selected: FeedWithCounts | null | undefined;
}) {
  const qc = useQueryClient();
  const refresh = useMutation({
    mutationFn: (id: number) => api.feedRefresh(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["feeds"] });
      qc.invalidateQueries({ queryKey: ["feed-items"] });
    },
  });
  const markAll = useMutation({
    mutationFn: (id: number) => api.feedMarkAllSeen(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["feeds"] });
      qc.invalidateQueries({ queryKey: ["feed-items"] });
    },
  });

  return (
    <div className="border-b border-litera-line px-5 py-3 flex items-center gap-3">
      <button
        onClick={() => onOnlyUnread(!onlyUnread)}
        className={
          "text-xs px-2 py-1 rounded border " +
          (onlyUnread
            ? "border-litera-accent/50 bg-litera-accent/15 text-litera-accent"
            : "border-litera-line text-litera-text/80 hover:bg-litera-panel")
        }
      >
        {onlyUnread ? "只看未读" : "全部"}
      </button>
      {selected && (
        <>
          <button
            onClick={() => refresh.mutate(selected.id)}
            disabled={refresh.isPending}
            className="text-xs px-2 py-1 rounded border border-litera-line text-litera-text/80 hover:bg-litera-panel flex items-center gap-1.5 disabled:opacity-60"
          >
            {refresh.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            刷新此订阅
          </button>
          <button
            onClick={() => markAll.mutate(selected.id)}
            disabled={markAll.isPending}
            className="text-xs px-2 py-1 rounded border border-litera-line text-litera-text/80 hover:bg-litera-panel flex items-center gap-1.5 disabled:opacity-60"
          >
            {markAll.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
            全部标为已读
          </button>
          <RefreshHint result={refresh.data} />
        </>
      )}
      {selected?.last_error && (
        <span className="ml-auto text-[11px] text-red-400/90 max-w-[420px] truncate" title={selected.last_error}>
          上次出错:{selected.last_error}
        </span>
      )}
    </div>
  );
}

function RefreshHint({ result }: { result: FeedRefreshResult | undefined }) {
  if (!result) return null;
  return (
    <span className="text-[11px] text-litera-mute">
      {result.not_modified ? "已是最新" : `+${result.new_items} 篇新文`}
    </span>
  );
}

function ItemsList({
  items, isLoading, error, feeds,
}: {
  items: FeedItem[];
  isLoading: boolean;
  error: Error | null;
  feeds: FeedWithCounts[];
}) {
  const feedMap = useMemo(() => new Map(feeds.map((f) => [f.id, f])), [feeds]);
  // Translation state lives at the list level so it persists across detail-drawer
  // open/close cycles within the same page view.
  const [translations, setTranslations] = useState<Map<string, TranslationResult>>(new Map());
  const [openItem, setOpenItem] = useState<FeedItem | null>(null);

  function applyTranslation(itemId: string, t: TranslationResult) {
    setTranslations((m) => {
      const next = new Map(m);
      next.set(itemId, t);
      return next;
    });
  }

  if (error) {
    return <div className="p-6 text-sm text-red-400/90">条目加载失败:{error.message}</div>;
  }
  if (isLoading) {
    return (
      <div className="p-6 text-sm text-litera-mute flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> 加载中…
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="p-12 text-center text-sm text-litera-mute">
        <Inbox className="h-9 w-9 mx-auto mb-3 opacity-40" />
        没有可显示的条目。订阅一个 RSS,然后点 🔄 刷新。
      </div>
    );
  }
  return (
    <>
      <ul className="divide-y divide-litera-line">
        {items.map((it) => (
          <ItemRow
            key={it.id}
            item={it}
            feedTitle={feedMap.get(it.feed_id)?.title ?? ""}
            translation={translations.get(it.id) ?? null}
            onOpen={() => setOpenItem(it)}
            onTranslated={(t) => applyTranslation(it.id, t)}
          />
        ))}
      </ul>
      {openItem && (
        <FeedItemDetailDrawer
          item={openItem}
          feedTitle={feedMap.get(openItem.feed_id)?.title ?? ""}
          translation={translations.get(openItem.id) ?? null}
          onTranslated={(t) => applyTranslation(openItem.id, t)}
          onClose={() => setOpenItem(null)}
        />
      )}
    </>
  );
}

/// Build a synthetic ArxivDraft from a feed entry so we can reuse the existing
/// `draft_translate` IPC (which already routes through the translate task LLM
/// profile and returns title + abstract). Falls back gracefully when the
/// upstream feed doesn't carry an arXiv ID or DOI.
function feedItemToDraft(item: FeedItem): ArxivDraft {
  const link = item.link ?? "";
  const arxivMatch = link.match(/arxiv\.org\/(?:abs|pdf|html|format)\/([\w\-./]+?)(?:v\d+)?(?:\.pdf)?(?:[?#].*)?$/i);
  const doiMatch = link.match(/doi\.org\/(10\.\d{4,9}\/[^\s?#]+)/i);
  const year = item.published_at ? new Date(item.published_at * 1000).getUTCFullYear() : null;
  return {
    title: item.title,
    authors: item.authors,
    year,
    venue: null,
    doi: doiMatch ? doiMatch[1] : null,
    arxiv_id: arxivMatch ? arxivMatch[1] : null,
    abstract_text: item.summary,
  };
}

function ItemRow({
  item, feedTitle, translation, onOpen, onTranslated,
}: {
  item: FeedItem;
  feedTitle: string;
  translation: TranslationResult | null;
  onOpen: () => void;
  onTranslated: (t: TranslationResult) => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { lang } = useI18n();
  const seen = useMutation({
    mutationFn: (s: boolean) => api.feedItemSetSeen(item.id, s),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["feeds"] });
      qc.invalidateQueries({ queryKey: ["feed-items"] });
    },
  });
  const translate = useMutation({
    mutationFn: () => api.draftTranslate(feedItemToDraft(item), llmLanguageNameFor(lang)),
    onSuccess: onTranslated,
  });

  function openExternal() {
    if (!item.link) return;
    seen.mutate(true);
    openInBrowser(item.link).catch(() => undefined);
  }

  function importToLibrary() {
    if (!item.link) return;
    const params = new URLSearchParams({
      fromFeedItem: item.id,
      link: item.link,
      title: item.title,
    });
    navigate(`/import?${params.toString()}`);
  }

  const published = item.published_at ? new Date(item.published_at * 1000) : null;

  return (
    <li className={"px-5 py-4 hover:bg-litera-panel/30 group " + (item.seen ? "opacity-70" : "")}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <button
            onClick={onOpen}
            className="text-sm font-medium text-litera-text leading-snug text-left hover:text-litera-accent"
            title="查看元数据 / 摘要"
          >
            {!item.seen && <span className="inline-block h-1.5 w-1.5 rounded-full bg-litera-accent mr-2 align-middle" />}
            {item.title}
            {item.imported_paper_id && (
              <span className="ml-2 text-[10px] text-emerald-400/90 align-middle">✓ 已入库</span>
            )}
          </button>
          {translation?.title && (
            <div className="text-xs text-litera-accent2 leading-snug mt-1">{translation.title}</div>
          )}
          <div className="text-[11px] text-litera-mute mt-1 flex items-center gap-2 flex-wrap">
            <span className="truncate max-w-[200px]">{feedTitle}</span>
            {published && <span>· {published.toISOString().slice(0, 10)}</span>}
            {item.authors.length > 0 && (
              <span className="truncate max-w-[280px]">
                · {item.authors.slice(0, 3).join(", ")}{item.authors.length > 3 ? " et al." : ""}
              </span>
            )}
          </div>
          {item.summary && (
            <p className="text-[12px] text-litera-text/70 mt-2 line-clamp-2 leading-relaxed">
              {item.summary}
            </p>
          )}
          {translation?.abstract_text && (
            <p className="text-[12px] text-litera-accent2/90 mt-1 line-clamp-3 leading-relaxed">
              {translation.abstract_text}
            </p>
          )}
          {translate.error && (
            <div className="mt-1 text-[11px] text-red-400/90">✕ 翻译失败:{(translate.error as Error).message}</div>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-1.5">
          <button
            onClick={() => translate.mutate()}
            disabled={translate.isPending}
            className="litera-btn text-xs whitespace-nowrap disabled:opacity-50"
            title="使用翻译任务绑定的模型翻译标题和摘要"
          >
            {translate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Languages className="h-3.5 w-3.5" />}
            翻译
          </button>
          {item.link && (
            <button
              onClick={openExternal}
              className="litera-btn text-xs whitespace-nowrap"
              title="在浏览器打开"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              打开
            </button>
          )}
          {item.link && !item.imported_paper_id && (
            <button
              onClick={importToLibrary}
              className="litera-btn-primary text-xs whitespace-nowrap"
              title="跳转到 📥 导入,绑定 PDF 后入库"
            >
              📥 入库
            </button>
          )}
          <button
            onClick={() => seen.mutate(!item.seen)}
            disabled={seen.isPending}
            className="text-[11px] text-litera-mute hover:text-litera-text flex items-center gap-1 px-1 py-0.5"
            title={item.seen ? "标为未读" : "标为已读"}
          >
            {seen.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : item.seen ? (
              <EyeOff className="h-3 w-3" />
            ) : (
              <Eye className="h-3 w-3" />
            )}
          </button>
        </div>
      </div>
    </li>
  );
}

function FeedItemDetailDrawer({
  item, feedTitle, translation, onTranslated, onClose,
}: {
  item: FeedItem;
  feedTitle: string;
  translation: TranslationResult | null;
  onTranslated: (t: TranslationResult) => void;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { lang } = useI18n();
  const translate = useMutation({
    mutationFn: () => api.draftTranslate(feedItemToDraft(item), llmLanguageNameFor(lang)),
    onSuccess: onTranslated,
  });
  const draft = useMemo(() => feedItemToDraft(item), [item]);
  const published = item.published_at ? new Date(item.published_at * 1000) : null;

  function openExternal() {
    if (item.link) openInBrowser(item.link).catch(() => undefined);
  }
  function importToLibrary() {
    if (!item.link) return;
    const params = new URLSearchParams({
      fromFeedItem: item.id,
      link: item.link,
      title: item.title,
    });
    navigate(`/import?${params.toString()}`);
  }

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-litera-ink/40 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[760px] max-w-[94vw] h-full bg-litera-paper border-l border-litera-line shadow-2xl flex flex-col"
      >
        <header className="px-5 py-4 border-b border-litera-line flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-litera-accent2">RSS metadata</div>
            <h2 className="font-serif text-xl leading-tight mt-1">{item.title}</h2>
            {translation?.title && (
              <p className="text-sm text-litera-accent mt-2">{translation.title}</p>
            )}
          </div>
          <button onClick={onClose} className="text-litera-mute hover:text-litera-text">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="px-5 py-3 border-b border-litera-line flex items-center gap-2 flex-wrap">
          <button
            onClick={() => translate.mutate()}
            disabled={translate.isPending}
            className="litera-btn text-xs disabled:opacity-50"
          >
            {translate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Languages className="h-3.5 w-3.5" />}
            翻译标题和摘要
          </button>
          {item.link && (
            <button onClick={openExternal} className="litera-btn text-xs">
              <ExternalLink className="h-3.5 w-3.5" /> 在浏览器打开
            </button>
          )}
          {item.link && !item.imported_paper_id && (
            <button onClick={importToLibrary} className="litera-btn-primary text-xs">
              📥 入库(去导入页绑定 PDF)
            </button>
          )}
          {item.imported_paper_id && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
              ✓ 已入库
            </span>
          )}
        </div>

        <div className="flex-1 overflow-auto px-5 py-4 space-y-5">
          <Meta item={item} feedTitle={feedTitle} draft={draft} published={published} />
          <Section title="摘要" body={item.summary || "(订阅源未提供摘要)"} />
          {translation?.abstract_text && <Section title="摘要译文" body={translation.abstract_text} accent />}
          {translate.error && (
            <div className="text-sm text-red-400/90">✕ 翻译失败:{(translate.error as Error).message}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function Meta({
  item, feedTitle, draft, published,
}: {
  item: FeedItem;
  feedTitle: string;
  draft: ArxivDraft;
  published: Date | null;
}) {
  return (
    <dl className="grid grid-cols-[92px_1fr] gap-x-3 gap-y-2 text-sm">
      <dt className="text-litera-mute">订阅源</dt>
      <dd>{feedTitle || "—"}</dd>
      <dt className="text-litera-mute">作者</dt>
      <dd>{item.authors.join(", ") || "(unknown)"}</dd>
      <dt className="text-litera-mute">发布时间</dt>
      <dd>{published ? published.toISOString().slice(0, 10) : "(unknown)"}</dd>
      <dt className="text-litera-mute">链接</dt>
      <dd className="font-mono break-all">
        {item.link ? (
          <a
            href={item.link}
            onClick={(e) => {
              e.preventDefault();
              openInBrowser(item.link!).catch(() => undefined);
            }}
            className="text-litera-accent2 hover:underline inline-flex items-center gap-1"
          >
            {item.link} <ExternalLink className="h-3 w-3" />
          </a>
        ) : "(none)"}
      </dd>
      {draft.arxiv_id && (
        <>
          <dt className="text-litera-mute">arXiv</dt>
          <dd className="font-mono">{draft.arxiv_id}</dd>
        </>
      )}
      {draft.doi && (
        <>
          <dt className="text-litera-mute">DOI</dt>
          <dd className="font-mono">{draft.doi}</dd>
        </>
      )}
    </dl>
  );
}

function Section({ title, body, accent }: { title: string; body: string; accent?: boolean }) {
  return (
    <section>
      <h3 className="text-xs uppercase tracking-wider text-litera-mute mb-2">{title}</h3>
      <p className={"text-sm leading-relaxed whitespace-pre-wrap " + (accent ? "text-litera-accent" : "text-litera-text")}>
        {body}
      </p>
    </section>
  );
}
