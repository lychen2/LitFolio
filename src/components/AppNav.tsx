import { NavLink, useLocation } from "react-router-dom";
import { BookOpenText, HardDrive, PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";
import { clsx } from "clsx";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { useT } from "@/i18n/I18nProvider";
import { NAVIGATION_GROUPS, NAVIGATION_ITEMS } from "@/lib/navigationRegistry";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export function AppNav({
  unseenCount,
  appVersion,
  storageBytes,
  showPinToggle,
  pinned,
  onTogglePin,
}: {
  unseenCount: number;
  appVersion: string | undefined;
  storageBytes: number | null;
  showPinToggle: boolean;
  pinned: boolean;
  onTogglePin: () => void;
}) {
  const t = useT();
  const location = useLocation();
  const items = new Map(NAVIGATION_ITEMS.map((item) => [item.to, item]));

  function isItemActive(path: string): boolean {
    if (path === "/library" && location.pathname.startsWith("/reader/")) return true;
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-2 mb-4">
        <BookOpenText className="h-5 w-5 shrink-0 text-litera-accent" aria-hidden="true" />
        <span className="nav-label text-base font-semibold tracking-tight text-litera-text">LitFolio</span>
        {showPinToggle && (
          <button
            onClick={onTogglePin}
            className="litera-icon-btn ml-auto"
            title={pinned ? t("shell.unpinNav") : t("shell.pinNav")}
            aria-label={pinned ? t("shell.unpinNav") : t("shell.pinNav")}
            aria-pressed={pinned}
          >
            {pinned ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </button>
        )}
      </div>

      <NavLink
        to="/import"
        className="mb-5 hidden min-h-9 items-center justify-center gap-2 rounded-[var(--litera-radius)] border border-litera-accent bg-litera-accent px-3 py-1.5 text-sm font-semibold text-litera-ink transition-colors hover:bg-litera-accent/90 max-[900px]:mx-auto max-[900px]:flex max-[900px]:h-9 max-[900px]:w-9 max-[900px]:p-0"
        title={t("nav.import")}
      >
        <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="nav-label">{t("nav.import")}</span>
      </NavLink>

      <nav aria-label={t("shell.navigation")} className="min-h-0 flex-1 overflow-y-auto">
        {NAVIGATION_GROUPS.map((group) => (
          <div key={group.id} className="mb-5 last:mb-0">
            <div className="nav-label litera-section-label mb-1 px-2">{t(group.labelKey)}</div>
            <div className="space-y-0.5">
              {group.paths.map((path) => {
                const item = items.get(path);
                if (!item) return null;
                const Icon = item.icon;
                const active = isItemActive(path);
                return (
                  <NavLink
                    key={path}
                    to={path}
                    className={clsx(
                      "group relative flex min-h-9 items-center gap-2.5 rounded-[var(--litera-radius)] px-2.5 text-sm transition-colors duration-150 max-[900px]:mx-auto max-[900px]:h-9 max-[900px]:w-9 max-[900px]:justify-center max-[900px]:p-0",
                      path === "/import" && "max-[900px]:hidden",
                      active
                        ? "bg-litera-accent/14 text-litera-accent"
                        : "text-litera-mute hover:bg-litera-surface2 hover:text-litera-text",
                    )}
                    title={t(item.labelKey)}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="nav-label min-w-0 truncate">{t(item.labelKey)}</span>
                    {path === "/topic" && unseenCount > 0 && (
                      <span className="nav-label ml-auto rounded-full bg-litera-accent/18 px-1.5 py-0.5 text-[10px] tabular-nums text-litera-accent">
                        {unseenCount}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="nav-footer mt-5 flex flex-col gap-2 border-t border-litera-border px-2 pt-3">
        <LanguageSwitcher />
        <div className="flex items-center gap-2 text-[11px] text-litera-mute">
          {appVersion ? <span>v{appVersion}</span> : null}
          {storageBytes != null && (
            <span className="flex items-center gap-1 tabular-nums">
              <HardDrive className="h-3 w-3" aria-hidden="true" />
              {fmtBytes(storageBytes)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function AutoHideNav(props: ComponentProps<typeof AppNav>) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      requestAnimationFrame(() => triggerRef.current?.focus());
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onMouseEnter={() => setOpen(true)}
        onClick={() => setOpen(true)}
        className={clsx("group absolute inset-y-0 left-0 z-40 w-4 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-litera-focus", open && "pointer-events-none opacity-0")}
        title={t("shell.showNav")}
        aria-label={t("shell.showNav")}
        aria-expanded={open}
      >
        <span className="absolute inset-y-0 left-0 w-1 bg-litera-border/70 transition-colors group-hover:bg-litera-accent/70" />
      </button>
      {open && (
        <aside
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          className="litera-slide-in-left absolute inset-y-0 left-0 z-40 flex w-[232px] flex-col border-r border-litera-border bg-litera-paper px-3 py-4 shadow-xl"
        >
          <AppNav {...props} />
        </aside>
      )}
    </>
  );
}

function fmtBytes(bytes: number): string {
  if (bytes === 0) return "0B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)}${units[i]}`;
}
