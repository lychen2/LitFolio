import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Rss } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
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
    <div className="border-b border-litera-line px-6 py-3 bg-litera-accent/5 flex items-center gap-3">
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
          <button
            onClick={open}
            className="mt-0.5 font-mono text-[11px] text-litera-accent hover:underline truncate max-w-full block text-left"
          >
            {source.link}
          </button>
        )}
      </div>
      {source.link && (
        <button onClick={open} className="litera-btn text-xs flex items-center gap-1.5 shrink-0">
          <ExternalLink className="h-3.5 w-3.5" /> {t("import.openOrigin")}
        </button>
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
