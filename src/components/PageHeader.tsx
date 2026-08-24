import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  icon,
  actions,
  className = "",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={`litera-page-header ${className}`}>
      <div className="min-w-0">
        <h1 className="flex min-w-0 items-center gap-2 text-lg font-semibold tracking-tight text-litera-text">
          {icon}
          <span className="truncate">{title}</span>
        </h1>
        {subtitle && <p className="mt-0.5 max-w-[70ch] truncate text-xs text-litera-mute">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
