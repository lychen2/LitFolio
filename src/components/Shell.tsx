import { NavLink, useLocation } from "react-router-dom";
import { BookOpenText, HardDrive, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { clsx } from "clsx";
import { type ReactNode, useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useT } from "@/i18n/I18nProvider";
import { api } from "@/lib/api";
import { NAVIGATION_ITEMS } from "@/lib/navigationRegistry";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useFileDrop } from "@/hooks/useFileDrop";
import { DropZoneOverlay } from "@/components/DropZoneOverlay";
import { CommandPalette } from "@/components/CommandPalette";


const PIN_NAV_KEY = "litera-pin-nav";

export function Shell({ children }: { children: ReactNode }) {
  const { isDragging, importing, result, clearResult } = useFileDrop();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const location = useLocation();

  // On the reader route the global nav auto-hides so the PDF gets the full
  // width; the user can still pin it open (persisted) if they'd rather keep it.
  // Default is unpinned → auto-hide on the reader.
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

  const { data: unseenCount = 0 } = useQuery({
    queryKey: ["topic-alert-unseen"],
    queryFn: api.topicAlertUnseenCount,
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

  const handlePaletteToggle = useCallback(() => setPaletteOpen((o) => !o), []);
  const handlePaletteClose = useCallback(() => setPaletteOpen(false), []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        handlePaletteToggle();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handlePaletteToggle]);

  const storageBytes =
    storage != null
      ? storage.papers_bytes +
        storage.notes_bytes +
        storage.attachments_bytes +
        storage.vectors_bytes +
        storage.database_bytes
      : null;

  return (
    <>
    <CommandPalette open={paletteOpen} onClose={handlePaletteClose} />
    <div className="flex h-full w-full overflow-hidden relative">
      <DropZoneOverlay
        isDragging={isDragging}
        importing={importing}
        result={result}
        onDismiss={clearResult}
      />
      {autoHide ? (
        <AutoHideNav unseenCount={unseenCount} appVersion={appVersion} storageBytes={storageBytes} pinned={pinned} onTogglePin={togglePinned} />
      ) : (
        <aside className="w-[210px] shrink-0 border-r border-litera-line bg-litera-paper/40 px-3 py-4 flex flex-col">
          <NavContent unseenCount={unseenCount} appVersion={appVersion} storageBytes={storageBytes} showPinToggle={onReader} pinned={pinned} onTogglePin={togglePinned} />
        </aside>
      )}
      <main className="flex-1 min-w-0 overflow-hidden">{children}</main>
    </div>
    </>
  );
}

/// Reader-mode navigation: slides off-screen by default, reappears when the
/// cursor reaches the far-left edge (or hovers the panel). Rendered as an
/// absolute overlay so it never squeezes the PDF area.
function AutoHideNav({
  unseenCount, appVersion, storageBytes, pinned, onTogglePin,
}: {
  unseenCount: number;
  appVersion: string | undefined;
  storageBytes: number | null;
  pinned: boolean;
  onTogglePin: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <>
      <div
        onMouseEnter={() => setOpen(true)}
        className={clsx(
          "absolute inset-y-0 left-0 w-4 z-40 cursor-pointer group/trigger",
          open && "pointer-events-none opacity-0",
        )}
        title={t("shell.showNav")}
        aria-hidden={open}
      >
        <div className="absolute inset-y-0 left-0 w-1 bg-litera-line/50 group-hover/trigger:bg-litera-accent/50 transition-colors" />
      </div>
      <aside
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className={clsx(
          "absolute inset-y-0 left-0 z-40 w-[210px] border-r border-litera-line bg-litera-paper px-3 py-4 flex flex-col shadow-xl",
          "transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <NavContent unseenCount={unseenCount} appVersion={appVersion} storageBytes={storageBytes} showPinToggle pinned={pinned} onTogglePin={onTogglePin} />
      </aside>
    </>
  );
}

function NavContent({
  unseenCount, appVersion, storageBytes, showPinToggle, pinned, onTogglePin,
}: {
  unseenCount: number;
  appVersion: string | undefined;
  storageBytes: number | null;
  showPinToggle: boolean;
  pinned: boolean;
  onTogglePin: () => void;
}) {
  const t = useT();
  return (
    <>
      <div className="flex items-center gap-2 px-2 mb-6">
        <BookOpenText className="h-5 w-5 text-litera-accent" />
        <span className="font-serif text-lg tracking-tight">LitFolio</span>
        {showPinToggle && (
          <button
            onClick={onTogglePin}
            className="ml-auto text-litera-mute hover:text-litera-text"
            title={pinned ? t("shell.unpinNav") : t("shell.pinNav")}
            aria-label={pinned ? t("shell.unpinNav") : t("shell.pinNav")}
            aria-pressed={pinned}
          >
            {pinned ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </button>
        )}
      </div>
      <nav className="flex flex-col gap-0.5">
        {NAVIGATION_ITEMS.map(({ to, labelKey, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx(
                "relative flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors duration-150",
                isActive
                  ? "bg-litera-accent/15 text-litera-accent"
                  : "text-litera-text/80 hover:bg-litera-panel hover:text-litera-text",
              )
            }
          >
            <Icon className="h-4 w-4" />
            {t(labelKey)}
            {to === "/topic" && unseenCount > 0 && (
              <span className="ml-auto text-[10px] bg-litera-accent/20 text-litera-accent px-1.5 py-0.5 rounded-full">
                {unseenCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto px-2 flex flex-col gap-2">
        <LanguageSwitcher />
        <div className="flex items-center gap-2 text-xs text-litera-mute">
          {appVersion ? <span>v{appVersion}</span> : null}
          {storageBytes != null && (
            <span className="flex items-center gap-1">
              <HardDrive className="h-3 w-3" />
              {fmtBytes(storageBytes)}
            </span>
          )}
          <span>{t("shell.footer")}</span>
        </div>
      </div>
    </>
  );
}

function fmtBytes(bytes: number): string {
  if (bytes === 0) return "0B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)}${units[i]}`;
}
