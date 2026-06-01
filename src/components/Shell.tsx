import { NavLink, useLocation } from "react-router-dom";
import { Archive, LibraryBig, Inbox, MessagesSquare, Settings, BookOpenText, Compass, Atom, Rss, Network, PanelLeftClose, PanelLeftOpen, FolderKanban } from "lucide-react";
import { clsx } from "clsx";
import { type ReactNode, useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useT } from "@/i18n/I18nProvider";
import type { TKey } from "@/i18n/dict";
import { api } from "@/lib/api";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useFileDrop } from "@/hooks/useFileDrop";
import { DropZoneOverlay } from "@/components/DropZoneOverlay";
import { CommandPalette } from "@/components/CommandPalette";

const navItems: { to: string; labelKey: TKey; icon: typeof LibraryBig }[] = [
  { to: "/library", labelKey: "nav.library", icon: LibraryBig },
  { to: "/import",  labelKey: "nav.import",  icon: Inbox },
  { to: "/browse",  labelKey: "nav.browse",  icon: Atom },
  { to: "/feeds",   labelKey: "nav.feeds",   icon: Rss },
  { to: "/candidates", labelKey: "nav.candidates", icon: Archive },
  { to: "/projects", labelKey: "nav.projects", icon: FolderKanban },
  { to: "/topic",   labelKey: "nav.topic",   icon: Compass },
  { to: "/ask",     labelKey: "nav.ask",     icon: MessagesSquare },
  { to: "/graph",   labelKey: "nav.graph",   icon: Network },
  { to: "/settings",labelKey: "nav.settings",icon: Settings },
];

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
        <AutoHideNav unseenCount={unseenCount} appVersion={appVersion} pinned={pinned} onTogglePin={togglePinned} />
      ) : (
        <aside className="w-[210px] shrink-0 border-r border-litera-line bg-litera-paper/40 px-3 py-4 flex flex-col">
          <NavContent unseenCount={unseenCount} appVersion={appVersion} showPinToggle={onReader} pinned={pinned} onTogglePin={togglePinned} />
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
  unseenCount, appVersion, pinned, onTogglePin,
}: {
  unseenCount: number;
  appVersion: string | undefined;
  pinned: boolean;
  onTogglePin: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Far-left hover trigger: a wide transparent hit area (easy to hit by
          slamming the cursor to the edge) with a thin visible hint line. */}
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
        <NavContent unseenCount={unseenCount} appVersion={appVersion} showPinToggle pinned={pinned} onTogglePin={onTogglePin} />
      </aside>
    </>
  );
}

function NavContent({
  unseenCount, appVersion, showPinToggle, pinned, onTogglePin,
}: {
  unseenCount: number;
  appVersion: string | undefined;
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
        {navItems.map(({ to, labelKey, icon: Icon }) => (
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
        <div className="text-xs text-litera-mute">{appVersion ? `v${appVersion}` : ""} {t("shell.footer")}</div>
      </div>
    </>
  );
}
