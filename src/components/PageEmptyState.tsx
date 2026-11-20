import type { ReactNode } from "react";

export function PageEmptyState({ icon, title, description }: {
  icon: ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div className="mx-auto max-w-md px-6 py-12 text-center text-sm text-litera-mute">
      <span className="litera-empty-icon mb-3" aria-hidden="true">{icon}</span>
      <p>{title}</p>
      {description && <p className="mt-2 text-xs opacity-70">{description}</p>}
    </div>
  );
}
