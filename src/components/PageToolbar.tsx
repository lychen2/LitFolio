import type { ReactNode } from "react";

export function PageToolbar({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`litera-toolbar ${className}`}>
      {children}
    </div>
  );
}
