import { forwardRef } from "react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md";

export const Button = forwardRef<HTMLButtonElement, ComponentPropsWithoutRef<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}>(function Button({ variant = "secondary", size = "md", type = "button", className, ...props }, ref) {
  return (
    <button
      {...props}
      ref={ref}
      type={type}
      className={cn(
        variant === "primary" ? "litera-btn-primary" : variant === "ghost" ? "litera-btn litera-btn-ghost" : "litera-btn",
        size === "md" && "litera-control-md",
        className,
      )}
    />
  );
});

export const IconButton = forwardRef<HTMLButtonElement, Omit<ComponentPropsWithoutRef<"button">, "aria-label"> & {
  label: string;
  size?: ButtonSize;
  children: ReactNode;
}>(function IconButton({ label, size = "md", type = "button", className, children, ...props }, ref) {
  return (
    <button {...props} ref={ref} type={type} aria-label={label} className={cn("litera-icon-btn", size === "md" && "litera-icon-control-md", className)}>
      {children}
    </button>
  );
});

export function Input({ className, ...props }: ComponentPropsWithoutRef<"input">) {
  return <input {...props} className={cn("litera-input litera-control-md", className)} />;
}
