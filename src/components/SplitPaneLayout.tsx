import type { ReactNode } from "react";

export function SplitPaneLayout({
  sidebar,
  children,
  sidebarWidth = "w-[250px]",
  className = "",
}: {
  sidebar: ReactNode;
  children: ReactNode;
  sidebarWidth?: string;
  className?: string;
}) {
  return (
    <div className={`flex min-h-0 flex-1 overflow-hidden ${className}`}>
      <aside className={`${sidebarWidth} min-h-0 shrink-0 border-r border-litera-border bg-litera-paper/55 max-[900px]:hidden`}>
        {sidebar}
      </aside>
      <div className="min-w-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
