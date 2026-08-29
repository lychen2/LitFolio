import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useT } from "@/i18n/I18nProvider";
import { api } from "@/lib/api";
import { AppNav, AutoHideNav } from "@/components/AppNav";
import { useFileDrop } from "@/hooks/useFileDrop";
import { DropZoneOverlay } from "@/components/DropZoneOverlay";
import { CommandPalette } from "@/components/CommandPalette";
import { useEnabledPluginIds } from "@/host/PluginSlot";

const PIN_NAV_KEY = "litera-pin-nav";

export function Shell({ children }: { children: ReactNode }) {
  const { isDragging, importing, result, clearResult } = useFileDrop();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const location = useLocation();
  const t = useT();

  // The reader gets the full width by default. Users can pin the app nav and
  // the choice persists across reader sessions.
  const onReader = location.pathname.startsWith("/reader/");
  const [pinned, setPinned] = useState(() => localStorage.getItem(PIN_NAV_KEY) === "1");
  const autoHide = onReader && !pinned;

  const togglePinned = useCallback(() => {
    setPinned((prev) => {
      const next = !prev;
      localStorage.setItem(PIN_NAV_KEY, next ? "1" : "0");
      return next;
    });
  }, []);

  const { data: enabledPlugins } = useEnabledPluginIds();
  const { data: unseenCount = 0 } = useQuery({
    queryKey: ["topic-alert-unseen"],
    queryFn: api.topicAlertUnseenCount,
    enabled: enabledPlugins?.has("discovery-feeds") === true,
    refetchInterval: 60_000,
  });
  const { data: appVersion } = useQuery({
    queryKey: ["app-version"],
    queryFn: api.appVersion,
    staleTime: Infinity,
  });
  const { data: storage } = useQuery({
    queryKey: ["storage-stats"],
    queryFn: api.storageStats,
    refetchOnMount: true,
    staleTime: 60_000,
  });

  const handlePaletteToggle = useCallback(() => setPaletteOpen((open) => !open), []);
  const handlePaletteClose = useCallback(() => setPaletteOpen(false), []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        handlePaletteToggle();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handlePaletteToggle]);

  const storageBytes = storage == null
    ? null
    : storage.papers_bytes + storage.notes_bytes + storage.attachments_bytes + storage.vectors_bytes + storage.database_bytes;
  const navProps = { unseenCount, appVersion, storageBytes, showPinToggle: onReader, pinned, onTogglePin: togglePinned };

  return (
    <>
      <a className="litera-skip-link" href="#main-content">{t("shell.skipToContent")}</a>
      <CommandPalette open={paletteOpen} onClose={handlePaletteClose} />
      <div className="relative flex h-full w-full overflow-hidden bg-litera-bg">
        <DropZoneOverlay isDragging={isDragging} importing={importing} result={result} onDismiss={clearResult} />
        {autoHide ? (
          <AutoHideNav {...navProps} />
        ) : (
          <aside className="flex w-[232px] shrink-0 flex-col border-r border-litera-border bg-litera-paper px-3 py-4 max-[900px]:w-14 max-[900px]:px-1">
            <AppNav {...navProps} />
          </aside>
        )}
        <main id="main-content" className="min-w-0 flex-1 overflow-hidden" tabIndex={-1}>
          {children}
        </main>
      </div>
    </>
  );
}
