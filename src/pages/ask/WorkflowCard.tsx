import type { ReactNode } from "react";

export function WorkflowCard({ icon, title, body, variant }: {
  icon: ReactNode;
  title: string;
  body: string;
  variant?: "default" | "wide";
}) {
  if (variant === "wide") {
    return (
      <div className="litera-panel p-4 lg:col-span-2 flex items-start gap-4">
        <div className="mt-0.5 shrink-0 text-litera-accent">{icon}</div>
        <div>
          <div className="text-sm font-medium text-litera-text mb-1">{title}</div>
          <p className="text-sm leading-relaxed text-litera-text/80">{body}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="litera-panel p-4">
      <div className="mb-3 flex items-center gap-2 text-litera-accent">
        {icon}
        <span className="text-sm font-medium">{title}</span>
      </div>
      <p className="text-sm leading-relaxed text-litera-text/80">{body}</p>
    </div>
  );
}
