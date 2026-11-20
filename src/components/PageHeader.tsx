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
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {icon && <span className="litera-page-title-icon" aria-hidden="true">{icon}</span>}
        <div className="min-w-0">
          <h1 className="litera-page-title"><span className="truncate">{title}</span></h1>
          {subtitle && <p className="mt-0.5 max-w-[70ch] truncate text-xs text-litera-mute">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
