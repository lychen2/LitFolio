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
        "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border transition-colors",
        active
          ? "border-litera-accent/40 bg-litera-accent/10 text-litera-accent"
          : "border-litera-line text-litera-text/80 hover:bg-litera-panel",
      )}
    >
      {icon} {label}
    </button>
  );
}
