import { cn } from "@/shared/utils/utils";
import type { HTMLAttributes } from "react";

type BadgeProps = HTMLAttributes<HTMLSpanElement>;

export function Badge({ className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--surface-strong)] px-2.5 py-0.5 text-xs font-medium text-[var(--foreground)]",
        className
      )}
      {...props}
    />
  );
}
