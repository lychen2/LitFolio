import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

export function ChoiceButton({ className, ...button }: ComponentPropsWithoutRef<"button">) {
  return <button type="button" {...button} className={cn("litera-tab", className)} />;
}
