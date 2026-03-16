import { cn } from "@/lib/utils";

export function Label({ className, ...props }) {
  return <span className={cn("text-sm font-medium text-slate-900", className)} {...props} />;
}
