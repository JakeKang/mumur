import { cn } from "@/lib/utils";

export function Badge({ className, ...props }) {
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
