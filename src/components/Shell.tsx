import { NavLink } from "react-router-dom";
import { LibraryBig, Inbox, MessagesSquare, Settings, BookOpenText, Compass, Atom, Rss, Network } from "lucide-react";
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
  { to: "/topic",   labelKey: "nav.topic",   icon: Compass },
  { to: "/ask",     labelKey: "nav.ask",     icon: MessagesSquare },
  { to: "/graph",   labelKey: "nav.graph",   icon: Network },
  { to: "/settings",labelKey: "nav.settings",icon: Settings },
];

export function Shell({ children }: { children: ReactNode }) {
  const t = useT();
  const { isDragging, importing, result, clearResult } = useFileDrop();
  const [paletteOpen, setPaletteOpen] = useState(false);

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
    <div className="flex h-full w-full overflow-hidden">
      <DropZoneOverlay
        isDragging={isDragging}
        importing={importing}
        result={result}
        onDismiss={clearResult}
      />
      <aside className="w-[210px] shrink-0 border-r border-litera-line bg-litera-paper/40 px-3 py-4 flex flex-col">
        <div className="flex items-center gap-2 px-2 mb-6">
          <BookOpenText className="h-5 w-5 text-litera-accent" />
          <span className="font-serif text-lg tracking-tight">LitFolio</span>
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
      </aside>
      <main className="flex-1 min-w-0 overflow-hidden">{children}</main>
    </div>
    </>
  );
}
