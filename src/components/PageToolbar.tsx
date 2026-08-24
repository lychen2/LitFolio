import type { ReactNode } from "react";

export function PageToolbar({
  children,
  className = "",
  sticky = false,
}: {
  children: ReactNode;
  className?: string;
  sticky?: boolean;
}) {
  return (
    <div className={`flex min-h-11 flex-wrap items-center gap-2 border-b border-litera-border bg-litera-bg px-5 py-2 ${sticky ? "sticky top-0 z-[var(--z-sticky)]" : ""} ${className}`}>
      {children}
    </div>
  );
}
