import { useMemo, useState } from "react";
import { Inbox, Loader2 } from "lucide-react";
import { type FeedItem, type FeedWithCounts, type TranslationResult } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";
import { FeedItemDetailDrawer } from "./FeedItemDetailDrawer";
import { FeedItemRow } from "./FeedItemRow";

export function ItemsList({
  items, isLoading, error, feeds,
}: {
  items: FeedItem[];
  isLoading: boolean;
  error: Error | null;
  feeds: FeedWithCounts[];
}) {
  const t = useT();
  const feedMap = useMemo(() => new Map(feeds.map((f) => [f.id, f])), [feeds]);
  const [translations, setTranslations] = useState<Map<string, TranslationResult>>(new Map());
  const [openItem, setOpenItem] = useState<FeedItem | null>(null);

  function applyTranslation(itemId: string, result: TranslationResult) {
    setTranslations((m) => {
      const next = new Map(m);
      next.set(itemId, result);
      return next;
    });
  }

  if (error) {
    return <div className="p-6 text-sm text-red-400/90">{t("feeds.itemsLoadFailed", { message: error.message })}</div>;
  }
  if (isLoading) return <LoadingItems />;
  if (items.length === 0) return <EmptyItems />;
  return (
    <>
      <ul className="divide-y divide-litera-line">
        {items.map((it) => (
          <FeedItemRow
            key={it.id}
            item={it}
            feedTitle={feedMap.get(it.feed_id)?.title ?? ""}
            translation={translations.get(it.id) ?? null}
            onOpen={() => setOpenItem(it)}
            onTranslated={(result) => applyTranslation(it.id, result)}
          />
        ))}
      </ul>
      {openItem && (
        <FeedItemDetailDrawer
          item={openItem}
          feedTitle={feedMap.get(openItem.feed_id)?.title ?? ""}
          translation={translations.get(openItem.id) ?? null}
          onTranslated={(result) => applyTranslation(openItem.id, result)}
          onClose={() => setOpenItem(null)}
        />
      )}
    </>
  );
}

function LoadingItems() {
  const t = useT();
  return (
    <div className="p-6 text-sm text-litera-mute flex items-center gap-2">
      <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
    </div>
  );
}

function EmptyItems() {
  const t = useT();
  return (
    <div className="p-12 text-center text-sm text-litera-mute">
      <Inbox className="h-9 w-9 mx-auto mb-3 opacity-40" />
      {t("feeds.empty")}
    </div>
  );
}
