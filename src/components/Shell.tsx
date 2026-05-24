import { NavLink } from "react-router-dom";
import { LibraryBig, Inbox, MessagesSquare, Settings, BookOpenText, Compass, Atom } from "lucide-react";
import { clsx } from "clsx";
import type { ReactNode } from "react";

const navItems = [
  { to: "/library", label: "Library", icon: LibraryBig },
  { to: "/import",  label: "Import",  icon: Inbox },
  { to: "/browse",  label: "Browse",  icon: Atom },
  { to: "/topic",   label: "Topic",   icon: Compass },
  { to: "/ask",     label: "Ask",     icon: MessagesSquare },
  { to: "/settings",label: "Settings",icon: Settings },
];

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full w-full overflow-hidden">
      <aside className="w-[210px] shrink-0 border-r border-litera-line bg-litera-paper/40 px-3 py-4 flex flex-col">
        <div className="flex items-center gap-2 px-2 mb-6">
          <BookOpenText className="h-5 w-5 text-litera-accent" />
          <span className="font-serif text-lg tracking-tight">Litera</span>
        </div>
        <nav className="flex flex-col gap-0.5">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors",
                  isActive
                    ? "bg-litera-accent/15 text-litera-accent"
                    : "text-litera-text/80 hover:bg-litera-panel hover:text-litera-text",
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto px-2 text-xs text-litera-mute">
          v0.1.0 · local-first
        </div>
      </aside>
      <main className="flex-1 min-w-0 overflow-hidden">{children}</main>
    </div>
  );
}
