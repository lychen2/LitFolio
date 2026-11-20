import { useQuery } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink, Rss } from "@/components/icons";
import { Button } from "@/components/ui";
import { api } from "@/lib/api";
import { useT } from "@/i18n/I18nProvider";
import { type ImportSource } from "./types";

export function ImportSourceBanner({ source }: { source: ImportSource }) {
  const t = useT();
  if (!source.link && !source.fromFeedItem) return null;
  function open() {
    if (source.link) openUrl(source.link).catch(() => undefined);
  }
  return (
    <div className="flex items-center gap-3 border-b border-litera-line bg-litera-accent/5 px-[var(--litera-page-inset)] py-3">
      {source.fromFeedItem ? (
        <Rss className="h-4 w-4 text-litera-accent shrink-0" />
      ) : (
        <ExternalLink className="h-4 w-4 text-litera-accent shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-xs uppercase tracking-wider text-litera-mute">
          {source.fromFeedItem ? t("import.fromFeed") : t("import.source")}
        </div>
        {source.title && <div className="text-sm text-litera-text truncate" title={source.title}>{source.title}</div>}
        {source.link && (
          <Button
            variant="ghost"
            size="sm"
            onClick={open}
            className="max-w-full justify-start px-0 font-mono text-xs text-litera-accent hover:underline"
          >
            <span className="truncate">{source.link}</span>
          </Button>
        )}
      </div>
      {source.link && (
        <Button variant="ghost" size="sm" onClick={open}>
          <ExternalLink className="h-3.5 w-3.5" /> {t("import.openOrigin")}
        </Button>
      )}
    </div>
  );
}

export function LibraryStats() {
  const t = useT();
  const { data: count } = useQuery({ queryKey: ["papers", "count"], queryFn: api.papersCount });
  const { data: root } = useQuery({ queryKey: ["library", "root"], queryFn: api.libraryRoot });
  return (
    <div className="text-right text-xs text-litera-mute">
      <div>{t("import.stats.count", { count: String(count ?? "—") })}</div>
      <div className="font-mono mt-0.5 max-w-[420px] truncate">{root ?? ""}</div>
    </div>
  );
}
