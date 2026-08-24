import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon?: ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex min-h-8 items-center gap-1.5 rounded-[var(--litera-radius)] border px-2.5 py-1 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-litera-focus",
        active
          ? "border-litera-accent/60 bg-litera-accent/12 text-litera-accent"
          : "border-litera-border bg-litera-surface text-litera-mute hover:border-litera-border-strong hover:bg-litera-surface2 hover:text-litera-text",
      )}
    >
      {icon} {label}
    </button>
  );
}
