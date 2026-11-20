import { Link, NavLink, useLocation } from "react-router-dom";
import { HardDrive, PanelLeftClose, PanelLeftOpen, Plus } from "@/components/icons";
import { clsx } from "clsx";
import { useEffect, useId, useRef, useState, type ComponentProps } from "react";
import { useT } from "@/i18n/I18nProvider";
import { visibleNavigation } from "@/lib/navigationRegistry";
import { useEnabledPluginIds } from "@/host/PluginSlot";
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
  const logoTintId = useId();
  const { data: enabled } = useEnabledPluginIds();
  const { items: navItems, groups } = visibleNavigation(enabled);
  const items = new Map(navItems.map((item) => [item.to, item]));

  function isItemActive(path: string): boolean {
    if (path === "/library" && location.pathname.startsWith("/reader/")) return true;
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-2 mb-4">
        <svg
          viewBox="0 0 512 512"
          role="img"
          aria-label="LitFolio"
          className="h-7 w-7 shrink-0 rounded-[var(--litera-radius-sm,6px)] shadow-sm"
        >
          <defs>
            <filter id={logoTintId} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
              <feFlood floodColor="var(--litera-accent)" result="themeAccent" />
              <feBlend in="themeAccent" in2="SourceGraphic" mode="color" />
              <feComposite in2="SourceAlpha" operator="in" />
            </filter>
          </defs>
          <image href="/litera.svg" width="512" height="512" filter={`url(#${logoTintId})`} />
        </svg>
        <span className="nav-label litera-wordmark">LitFolio</span>
        {showPinToggle && (
          <button
            onClick={onTogglePin}
            className="litera-icon-btn ml-auto"
            title={pinned ? t("shell.unpinNav") : t("shell.pinNav")}
            aria-label={pinned ? t("shell.unpinNav") : t("shell.pinNav")}
            aria-pressed={pinned}
          >
            {pinned ? <PanelLeftClose className="size-5" /> : <PanelLeftOpen className="size-5" />}
          </button>
        )}
      </div>

      <NavLink
        to="/import"
        className="litera-btn-primary mb-5 hidden max-[900px]:mx-auto max-[900px]:inline-flex max-[900px]:h-9 max-[900px]:w-9 max-[900px]:p-0"
        title={t("nav.import")}
      >
        <Plus className="size-5" aria-hidden="true" />
        <span className="nav-label">{t("nav.import")}</span>
      </NavLink>

      <nav aria-label={t("shell.navigation")} className="min-h-0 flex-1 overflow-y-auto">
        {groups.map((group) => (
          <div key={group.id} className="mb-5 last:mb-0">
            <div className="nav-label litera-section-label mb-1 px-2">{t(group.labelKey)}</div>
            <div className="space-y-0.5">
              {group.paths.map((path) => {
                const item = items.get(path);
                if (!item) return null;
                const Icon = item.icon;
                const active = isItemActive(path);
                return (
                  <Link
                    key={path}
                    to={path}
                    className={clsx(
                      "litera-nav-item min-h-9 max-[900px]:mx-auto max-[900px]:h-9 max-[900px]:w-9 max-[900px]:justify-center max-[900px]:p-0",
                      path === "/import" && "max-[900px]:hidden",
                    )}
                    title={t(item.labelKey)}
                    aria-current={active ? "page" : undefined}
                  >
                    <Icon className="size-5" aria-hidden="true" />
                    <span className="nav-label min-w-0 truncate">{t(item.labelKey)}</span>
                    {path === "/topic" && unseenCount > 0 && (
                      <span className="litera-badge ml-auto tabular-nums max-[900px]:hidden">
                        {unseenCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="nav-footer mt-5 flex flex-col gap-2 border-t border-litera-border px-2 pt-3 max-[900px]:items-center max-[900px]:px-0">
        <LanguageSwitcher />
        <div className="flex items-center gap-2 text-[11px] text-litera-mute max-[900px]:hidden">
          {appVersion ? <span>v{appVersion}</span> : null}
          {storageBytes != null && (
            <span className="flex items-center gap-1 tabular-nums">
              <HardDrive className="size-4" aria-hidden="true" />
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
        onPointerEnter={(event) => { if (event.pointerType === "mouse") setOpen(true); }}
        onClick={() => setOpen(true)}
        className={clsx("litera-reader-nav-trigger group absolute inset-y-0 left-0 z-40 w-4 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-litera-focus", open && "pointer-events-none opacity-0")}
        title={t("shell.showNav")}
        aria-label={t("shell.showNav")}
        aria-expanded={open}
      >
        <PanelLeftOpen aria-hidden="true" className="hidden size-5" />
        <span className="absolute inset-y-0 left-0 w-1 bg-litera-border/70 transition-colors group-hover:bg-litera-accent/70" />
      </button>
      {open && (
        <aside
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          className="litera-sidebar litera-slide-in-left absolute inset-y-0 left-0 z-40 flex w-[232px] flex-col px-3 py-4 shadow-xl"
        >
          <AppNav {...props} />
          <button type="button" className="litera-btn mt-2" onClick={() => { setOpen(false); triggerRef.current?.focus(); }}>
            {t("common.close")}
          </button>
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
