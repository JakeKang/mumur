import { cn } from "@/lib/utils";
import type { InputHTMLAttributes } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        "flex h-10 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] outline-none ring-offset-white placeholder:text-[var(--muted)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
        className
      )}
      {...props}
    />
  );
}
